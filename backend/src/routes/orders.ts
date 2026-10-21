import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { CreateOrderPayload } from '../types/index.js';
import { DteValidatorService } from '../services/dteValidator.js';
import { PricingService, ProductForPricing, ShippingZoneForPricing } from '../services/pricingService.js';
import { FactoService } from '../services/factoService.js';
import { emailService } from '../services/emailService.js';
import { emailConfirmacionOrden } from '../services/emailTemplates.js';
import { deliveryService } from '../services/deliveryService.js';
import { elegirBodegaParaPedido } from '../services/inventario.js';
import { ErrorReglaNegocio } from '../errors.js';
import { requireAuth } from '../services/authService.js';

const router = Router();

/**
 * Carga el catalogo y las zonas desde la base de datos.
 * Se usa PricingService con estos datos, nunca con arrays hardcodeados:
 * el precio debe salir de la misma fuente que la ficha del producto.
 */
async function loadPricingData() {
  const [products, zones] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { priceTiers: true }
    }),
    prisma.shippingZone.findMany({ where: { isActive: true } })
  ]);

  const productsForPricing: ProductForPricing[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    format: p.format,
    price: p.price,
    stock: p.stock,
    minWholesaleQty: p.minWholesaleQty,
    priceTiers: p.priceTiers.map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice }))
  }));

  const zonesForPricing: ShippingZoneForPricing[] = zones.map((z) => ({
    id: z.id,
    name: z.name,
    cost: z.cost,
    freeShippingThreshold: z.freeShippingThreshold
  }));

  return { productsForPricing, zonesForPricing, products, zones };
}

/**
 * Obtiene el nivel de precio del cliente autenticado.
 *
 * SIEMPRE se lee desde la base segun el id de la sesion. Nunca se
 * acepta un nivel enviado por el cliente en el body: si se aceptara,
 * cualquier persona podria llamar la API declarandose "Mayorista" y
 * obtener el descuento sin tener derecho a el.
 */
async function obtenerNivelCliente(userId: string | null) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      priceTier: {
        select: {
          id: true,
          nombre: true,
          descuentoPercent: true,
          aplicaSobreEscalon: true,
          isActive: true
        }
      }
    }
  });
  const tier = user?.priceTier;
  if (!tier || !tier.isActive || tier.descuentoPercent <= 0) return null;
  return tier;
}

/**
 * Genera el numero de pedido con secuencia, sin Math.random().
 *
 * El filtro exige que el sufijo sea solo digitos: si quedaran pedidos
 * antiguos o de prueba con sufijo alfanumerico (por ejemplo TEST01), el
 * cast a integer fallaria y caeria toda la creacion de pedidos.
 * Se usa un regex en la consulta, no solo el LIKE.
 */
async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const last = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("order_number" FROM 11) AS INTEGER)) AS max
    FROM orders
    WHERE "order_number" ~ ('^AMYB-' || ${year} || '-[0-9]+$')
  `;
  const next = (last[0]?.max ?? 0) + 1;
  return `AMYB-${year}-${String(next).padStart(6, '0')}`;
}

// =====================================================================
// POST /api/orders/calculate
// Calcula el carrito SIN crear el pedido. El frontend lo usa para
// mostrar el total mientras el cliente adjusts cantidades.
// =====================================================================
router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const { items, zoneId, couponCode, direccionEntrega } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Items requeridos' });
    }

    const { productsForPricing, zonesForPricing } = await loadPricingData();

    // El nivel de precio del cliente se resuelve desde la SESION, nunca
    // desde el body. Si el cliente enviara su propio priceTier, podria
    // asignarse a si mismo el nivel con mas descuento.
    const customerTier = await obtenerNivelCliente(req.user?.id ?? null);

    const calculation = PricingService.calculateCart(
      items,
      productsForPricing,
      zonesForPricing,
      zoneId || 'zone-temuco-centro',
      couponCode,
      customerTier
    );

    // Si viene la direccion, se valida la cobertura geografica para que
    // el cliente sepa antes de confirmar si le llega o no.
    let entrega: any = null;
    if (direccionEntrega) {
      entrega = await deliveryService.validar(direccionEntrega, calculation.subtotal);
    }

    res.json({
      success: true,
      data: { ...calculation, entrega }
    });
  } catch (error: any) {
    console.error('[ORDERS-CALCULATE] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al calcular el pedido.' });
  }
});

// =====================================================================
// POST /api/orders
// Crea el pedido en PostgreSQL. El total SIEMPRE se recalcula aqui:
// el valor que manda el frontend se descarta por completo.
// =====================================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const payload: CreateOrderPayload = req.body;
    const userId = req.user?.id ?? null;

    if (!payload.items || payload.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'El pedido debe contener al menos un producto.'
      });
    }

    if (!payload.customer || !payload.customer.nombre || !payload.customer.telefono) {
      return res.status(400).json({
        success: false,
        message: 'Información de contacto (nombre y teléfono) es obligatoria.'
      });
    }

    // --- Validacion DTE (Factura vs Boleta) ---
    if (payload.dte && payload.dte.tipoDocumento === 'factura') {
      const dteCheck = DteValidatorService.validateDteData(payload.dte);
      if (!dteCheck.valid) {
        return res.status(422).json({
          success: false,
          message: 'Error en validación tributaria DTE para Factura.',
          errors: dteCheck.errors
        });
      }
    }

    const { productsForPricing, zonesForPricing } = await loadPricingData();

    // --- Calculo financiero con precios de la base ---
    // El nivel de precio se resuelve desde la sesion, nunca desde el body.
    const customerTier = await obtenerNivelCliente(userId);

    const calculation = PricingService.calculateCart(
      payload.items,
      productsForPricing,
      zonesForPricing,
      payload.shipping.zoneId,
      payload.couponCode,
      customerTier
    );

    if (calculation.itemsResolved.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Ninguno de los productos del pedido esta disponible.'
      });
    }

    const zone =
      zonesForPricing.find((z) => z.id === payload.shipping.zoneId) ?? zonesForPricing[0];

    // --- Validacion de stock y minimo mayorista antes de crear el pedido ---
    // Se valida aqui y no solo en el carrito: el pedido se puede armar
    // por API sin pasar por la interfaz, y cobrar una venta que el
    // despacho no puede cubrir es peor que rechazarla.
    const erroresValidacion: string[] = [];

    for (const item of calculation.itemsResolved) {
      if (item.product.stock < item.quantity) {
        return res.status(409).json({
          success: false,
          code: 'INSUFFICIENT_STOCK',
          message: `Stock insuficiente para "${item.product.name}". Disponibles: ${item.product.stock}, solicitadas: ${item.quantity}.`
        });
      }

      if (item.minWholesaleQty > 1 && item.quantity < item.minWholesaleQty) {
        erroresValidacion.push(
          `"${item.product.name}" se vende en presentaciones minimas de ${item.minWholesaleQty} unidades (pediste ${item.quantity}).`
        );
      }
    }

    if (erroresValidacion.length > 0) {
      return res.status(422).json({
        success: false,
        code: 'BELOW_MINIMUM',
        message: erroresValidacion[0],
        warnings: erroresValidacion
      });
    }

    // --- Asignacion de bodega ---
    // El stock validado arriba es el TOTAL de todas las bodegas. Falta lo
    // que de verdad importa: si alguna bodega concreta puede despachar
    // este pedido completo. Si ninguna puede, no hay venta.
    //
    // El cliente no elige bodega: la elige el sistema segun la zona y la
    // disponibilidad. Se guarda en el pedido porque despues hay que
    // saber de donde salio cada venta.
    const asignacion = await elegirBodegaParaPedido(
      payload.shipping.zoneId,
      calculation.itemsResolved.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity
      }))
    );

    if (!asignacion.ok) {
      const nombres = asignacion.faltantes.map((f) => {
        const prod = calculation.itemsResolved.find(
          (i) => i.product.id === f.productId
        );
        return `"${prod?.product.name ?? f.productId}" (pide ${f.solicitado}, hay ${f.disponible})`;
      });

      // Error de negocio CON TIPO: el middleware central decide el 409 y
      // le pone el codigo estable. Antes cada ruta repetia esta logica a
      // mano y era facil equivocarse.
      throw new ErrorReglaNegocio(
        'NO_STOCK_IN_WAREHOUSE',
        `No podemos despachar este pedido desde ninguna bodega. ` +
          (nombres.length > 0 ? `Sin stock suficiente: ${nombres.join(', ')}.` : ''),
        {
          faltantes: asignacion.faltantes,
          // Se informa para que el operador entienda por que se rechazo,
          // sin exponerlo como una decision del cliente.
          bodegasDescartadas: asignacion.descartadas
        },
        409
      );
    }

    if (!asignacion.seSirvioDesdeLaZona) {
      console.log(
        `[INVENTARIO] Pedido a la zona ${payload.shipping.zoneId} se despacha desde ` +
          `${asignacion.warehouseName}: la bodega de la zona no podia armarlo completo.`
      );
    }

    // --- Cobertura geografica de la direccion de entrega ---
    //
    // Se valida aqui, en el servidor, y NO solo en el checkout. Si la
    // validacion quedara solo en el frontend, bastaria llamar esta API
    // directamente para crear un pedido fuera del radio de entrega.
    const entrega = await deliveryService.validar(
      payload.shipping.direccionEntrega,
      calculation.subtotal
    );

    if (entrega.ventaBloqueada) {
      return res.status(422).json({
        success: false,
        code: 'OUT_OF_DELIVERY_RANGE',
        message: entrega.mensaje,
        entrega
      });
    }

    const orderNumber = await generateOrderNumber();

    // --- Creacion del pedido con sus items en una transaccion ---
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId,
        // Datos congelados del momento de la compra
        customerNombre: payload.customer.nombre,
        customerEmail: payload.customer.email || req.user?.email || '',
        customerTelefono: payload.customer.telefono,
        dteTipoDocumento: payload.dte?.tipoDocumento || 'boleta',
        dteRutEmpresa: payload.dte?.rutEmpresa
          ? DteValidatorService.formatRut(payload.dte.rutEmpresa)
          : null,
        dteRazonSocial: payload.dte?.razonSocial ?? null,
        dteGiroComercial: payload.dte?.giroComercial ?? null,
        dteDireccion: payload.dte?.direccionTributaria ?? null,
        dteComuna: payload.dte?.comunaTributaria ?? null,
        subtotal: calculation.subtotal,
        descuento: calculation.descuento,
        neto: calculation.neto,
        iva: calculation.iva,
        costoEnvio: calculation.costoEnvio,
        total: calculation.total,
        // El estado de pago arranca SIEMPRE pendiente. El prototipo lo
        // marcaba 'confirmado' solo por elegir webpay, sin cobrar nada.
        paymentMethod: payload.paymentMethod,
        paymentStatus: 'pendiente',
        orderStatus: 'pendiente',
        shippingZoneId: zone?.id ?? '',
        shippingZoneName: zone?.name ?? '',
        // De que bodega sale. Lo asigno el sistema; el cliente no lo elige.
        warehouseId: asignacion.warehouseId,
        shippingAddress: payload.shipping.direccionEntrega,
        shippingComuna: payload.shipping.comuna ?? null,
        shippingNotes: payload.shipping.observaciones ?? null,
        // Trazabilidad de la cobertura: queda registrado COMO se valido
        // esta entrega, para poder detectar despues las ventas que se
        // aprobaron sin poder verificarlas de verdad.
        distanciaEntregaKm: entrega.distanciaKm > 0 ? entrega.distanciaKm : null,
        entregaVerificada: !entrega.aproximado,
        entregaAproximada: entrega.aproximado,
        items: {
          create: calculation.itemsResolved.map((item) => ({
            productId: item.product.id,
            // Snapshot: si manana sube el precio, este pedido no cambia
            productName: item.product.name,
            productFormat: item.product.format,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal
          }))
        }
      },
      include: { items: true }
    });

    // --- Emision de DTE en FACTO Chile ---
    //
    // REGLA FISCAL: un documento tributario respalda una operacion que
    // ocurrio. Emitirlo antes de saber si el pago fue autorizado
    // generaria boletas de ventas que nunca se cobraron.
    //
    // Por eso:
    //   - Webpay: NO se emite aqui. Queda pendiente y se emite en el
    //     commit, cuando Transbank confirma el pago (ver webpay.ts).
    //   - Transferencia o contra entrega: si emite ahora, porque la
    //     operacion se concretara por otro medio.
    const debeEmitirAhora = payload.paymentMethod !== 'webpay';

    let factoResult = null;
    if (!debeEmitirAhora) {
      // Se marca como pendiente de pago para que el libro tributario
      // no lo cuente hasta que haya dinero.
      await prisma.order.update({
        where: { id: order.id },
        data: { dteStatusLabel: 'Pendiente de confirmacion de pago' }
      });
    } else {
      // Se hace despues de guardar el pedido: si FACTO falla, el pedido
      // existe igual y se puede reintentar la emision sin perderlo.
      try {
        factoResult = await FactoService.emitDte({
          orderId: orderNumber,
          // El tipo de documento se normaliza aqui: en la base es un string
          // libre, pero FACTO solo acepta 'boleta' o 'factura'.
          documentType: order.dteTipoDocumento === 'factura' ? 'factura' : 'boleta',
          customer: {
            nombre: order.customerNombre,
            email: order.customerEmail,
            telefono: order.customerTelefono,
            rutEmpresa: order.dteRutEmpresa ?? undefined,
            razonSocial: order.dteRazonSocial ?? undefined,
            giroComercial: order.dteGiroComercial ?? undefined,
            direccionTributaria: order.dteDireccion ?? undefined,
            comunaTributaria: order.dteComuna ?? undefined
          },
          items: calculation.itemsResolved.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            price: item.unitPrice,
            format: item.product.format
          })),
          subtotal: order.subtotal,
          iva: order.iva,
          total: order.total
        });
      } catch (factoError: any) {
        console.error('[ORDERS-FACTO] Error al emitir DTE:', factoError.message);
      }
    }

    if (factoResult?.success) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          // FACTO devuelve el folio como numero; la columna es texto para
          // admitir tambien los folios alfanumericos de otros emisores.
          dteFolio: String(factoResult.folio),
          dteDocumentId: factoResult.documentId,
          dtePdfUrl: factoResult.pdfUrl,
          dteXmlUrl: factoResult.xmlUrl,
          dteStatusLabel: factoResult.statusLabel
        }
      });
    }

    // --- Aviso al cliente por email ---
    // NUNCA debe romper la respuesta: el pedido ya esta guardado. Si el
    // correo falla, el cliente igual ve su confirmacion en pantalla y
    // puede revisar el pedido mas tarde.
    try {
      const mail = emailConfirmacionOrden({
        nombre: order.customerNombre,
        orderNumber: order.orderNumber,
        items: order.items.map((i) => ({
          nombre: i.productName,
          cantidad: i.quantity,
          precio: i.unitPrice,
          subtotal: i.subtotal
        })),
        subtotal: order.subtotal,
        iva: order.iva,
        costoEnvio: order.costoEnvio,
        total: order.total,
        zona: order.shippingZoneName,
        direccion: order.shippingAddress,
        paymentMethod: order.paymentMethod,
        esFactura: order.dteTipoDocumento === 'factura'
      });

      await emailService.enviar({
        to: order.customerEmail,
        asunto: mail.asunto,
        html: mail.html,
        tipo: 'confirmacion_orden',
        orderId: order.id,
        userId
      });
    } catch (emailError: any) {
      console.error('[ORDERS-EMAIL] No se pudo enviar la confirmacion:', emailError.message);
    }

    res.status(201).json({
      success: true,
      message:
        factoResult?.success
          ? 'Pedido registrado y DTE generado exitosamente en FACTO Chile.'
          : 'Pedido registrado. El documento tributario quedo pendiente de emision.',
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        customer: {
          nombre: order.customerNombre,
          email: order.customerEmail,
          telefono: order.customerTelefono
        },
        dte: payload.dte,
        factoDte: factoResult?.success
          ? {
              documentId: factoResult.documentId,
              folio: factoResult.folio,
              documentTypeId: factoResult.documentTypeId,
              documentTypeName: factoResult.documentTypeName,
              siiCode: factoResult.siiCode,
              statusLabel: factoResult.statusLabel,
              isSandbox: factoResult.isSandbox,
              pdfUrl: factoResult.pdfUrl,
              xmlUrl: factoResult.xmlUrl
            }
          : undefined,
        subtotal: order.subtotal,
        descuento: order.descuento,
        volumetricDiscount: calculation.volumetricDiscount,
        customerDiscount: calculation.customerDiscount,
        customerTier: calculation.customerTier,
        entrega,
        iva: order.iva,
        costoEnvio: order.costoEnvio,
        total: order.total,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        shippingZone: order.shippingZoneName,
        shippingAddress: order.shippingAddress,
        items: order.items.map((i) => ({
          id: i.productId,
          name: i.productName,
          format: i.productFormat,
          quantity: i.quantity,
          price: i.unitPrice,
          subtotal: i.subtotal
        })),
        warnings: calculation.warnings
      }
    });
  } catch (error: any) {
    console.error('[ORDERS-CREATE] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'No se pudo registrar el pedido.',
      detail: error.message
    });
  }
});

// =====================================================================
// GET /api/orders/mine
// Historial de pedidos del cliente conectado. Por eso el router
// opcionalAuth debe correr antes que estas rutas.
// =====================================================================
router.get('/mine', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Debes iniciar sesion para ver tus pedidos.',
        code: 'UNAUTHORIZED'
      });
    }

    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: {
        orders: orders.map((o) => ({
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdAt: o.createdAt,
          paymentStatus: o.paymentStatus,
          orderStatus: o.orderStatus,
          paymentMethod: o.paymentMethod,
          total: o.total,
          itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
          // El detalle de productos viaja con el historial. El cliente
          // tiene que ver que compro, no solo cuantas unidades: sin
          // esto la unica forma de saberlo es repetir el pedido.
          items: o.items.map((i) => ({
            id: i.id,
            name: i.productName,
            format: i.productFormat,
            quantity: i.quantity,
            price: i.unitPrice,
            subtotal: i.subtotal
          })),
          dteFolio: o.dteFolio,
          dtePdfUrl: o.dtePdfUrl,
          shippingZoneName: o.shippingZoneName
        }))
      }
    });
  } catch (error: any) {
    console.error('[ORDERS-MINE] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar tus pedidos.' });
  }
});

// =====================================================================
// GET /api/orders/:id
// Detalle completo: cliente, direccion, productos y pagos.
//
// Exige sesion (requireAuth). Antes el chequeo de pertenencia usaba
// "order.userId && req.user && ...": al no haber usuario, la cadena
// se cortaba en false y el pedido se devolvia entero a cualquiera,
// sin iniciar sesion. Eso exponia nombre, email, telefono y direccion
// de entrega de todos los clientes, y los orderId son publicos en el
// libro DTE, asi que no habia ni que adivinarlos.
// =====================================================================
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { sku: true } } } },
        transactions: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    }

    // Un cliente solo puede ver sus propios pedidos. El admin puede ver
    // todos. requireAuth ya garantiza que req.user existe.
    if (order.userId && order.userId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver este pedido.'
      });
    }

    res.json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        customer: {
          nombre: order.customerNombre,
          email: order.customerEmail,
          telefono: order.customerTelefono
        },
        subtotal: order.subtotal,
        descuento: order.descuento,
        // neto e iva son los que van al DTE. Ojo: subtotal es el precio
        // de vitrina, que en Chile YA INCLUYE IVA, asi que no sirve como
        // neto. neto + iva = total.
        neto: order.neto,
        iva: order.iva,
        costoEnvio: order.costoEnvio,
        total: order.total,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        shippingZone: order.shippingZoneName,
        shippingAddress: order.shippingAddress,
        dte: {
          tipoDocumento: order.dteTipoDocumento,
          folio: order.dteFolio,
          pdfUrl: order.dtePdfUrl,
          statusLabel: order.dteStatusLabel
        },
        items: order.items.map((i) => ({
          id: i.productId,
          sku: i.product.sku,
          name: i.productName,
          format: i.productFormat,
          quantity: i.quantity,
          price: i.unitPrice,
          subtotal: i.subtotal,
          // En una factura los valores van SIN IVA. El precio de
          // vitrina lo incluye, por eso se separan.
          precioNeto: Math.round(i.unitPrice / 1.19),
          subtotalNeto: Math.round(i.subtotal / 1.19)
        })),
        transactions: order.transactions.map((t) => ({
          status: t.status,
          amount: t.amount,
          cardNumber: t.cardNumber,
          authorizationCode: t.authorizationCode,
          createdAt: t.createdAt
        }))
      }
    });
  } catch (error: any) {
    console.error('[ORDERS-GET] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar el pedido.' });
  }
});

// =====================================================================
// GET /api/orders/:id/dte-status
// Consulta asincrona del estado del documento en el SII.
// =====================================================================
router.get('/:id/dte-status', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const order = await prisma.order.findUnique({ where: { id } });

    if (!order || !order.dteDocumentId) {
      return res
        .status(404)
        .json({ success: false, message: 'Orden o DTE no encontrado' });
    }

    const status = await FactoService.getDocumentStatus(order.dteDocumentId);

    res.json({
      success: true,
      orderId: id,
      factoDte: {
        documentId: order.dteDocumentId,
        folio: order.dteFolio,
        statusLabel: order.dteStatusLabel,
        pdfUrl: order.dtePdfUrl,
        xmlUrl: order.dteXmlUrl
      },
      siiStatus: status
    });
  } catch (error: any) {
    console.error('[ORDERS-DTE-STATUS] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al consultar el DTE.' });
  }
});

export default router;
