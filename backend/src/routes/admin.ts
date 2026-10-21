import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../services/authService.js';
import { emailService } from '../services/emailService.js';
import { emailDespacho, emailEntregado } from '../services/emailTemplates.js';
import {
  enviarCorreoDePedido,
  correosFallidos,
  type TipoCorreoPedido
} from '../services/notificaciones.js';
import { registrarMovimiento, distribucionDeProducto } from '../services/inventario.js';
import { expirarPagosAbandonados, pagosColgados } from '../services/pagos.js';
import { deliveryService } from '../services/deliveryService.js';

const router = Router();

// Todas las rutas del panel exigen sesion Y rol admin.
// requireAuth va primero porque requireAdmin lee req.user.
router.use(requireAuth, requireAdmin);

/** Quita tildes para poder buscar sin acentos. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// =====================================================================
// GET /api/admin/dashboard
// Metricas de la operacion: ventas, pedidos, stock y alertas.
// =====================================================================
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const [
      pedidosHoy,
      pedidosMes,
      ventasHoy,
      ventasMes,
      porPagar,
      cancelados,
      productosActivos,
      productosStockBajo,
      totalClientes,
      anulacionesPendientes,
      ultimosPedidos,
      topProductos
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: hoy } } }),
      prisma.order.count({
        where: { createdAt: { gte: new Date(hoy.getFullYear(), hoy.getMonth(), 1) } }
      }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: hoy }, paymentStatus: 'pagado' }
      }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: {
          createdAt: { gte: new Date(hoy.getFullYear(), hoy.getMonth(), 1) },
          paymentStatus: 'pagado'
        }
      }),
      prisma.order.count({ where: { orderStatus: 'pagado' } }),
      prisma.order.count({ where: { orderStatus: 'cancelado' } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({
        where: { isActive: true, stock: { lte: 10 } }
      }),
      prisma.user.count({ where: { role: 'customer' } }),
      // Plata de clientes cobrada y todavia no devuelta. Cada uno de
      // estos pedidos es un reembolso con fecha limite, asi que se cuenta
      // aparte para que no se pierda en el ruido del dashboard.
      prisma.order.count({ where: { paymentStatus: 'reembolso_pendiente' } }),
      prisma.order.findMany({
        include: { items: true, user: { select: { nombre: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5
      })
    ]);

    res.json({
      success: true,
      data: {
        ventas: {
          hoy: ventasHoy._sum.total ?? 0,
          mes: ventasMes._sum.total ?? 0
        },
        pedidos: {
          hoy: pedidosHoy,
          mes: pedidosMes,
          porPagar,
          cancelados,
          anulacionesPendientes
        },
        catalogo: {
          productosActivos,
          stockBajo: productosStockBajo
        },
        clientes: totalClientes,
        ultimosPedidos: ultimosPedidos.map((o) => ({
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdAt: o.createdAt,
          total: o.total,
          paymentStatus: o.paymentStatus,
          orderStatus: o.orderStatus,
          cliente: o.customerNombre,
          email: o.user?.email ?? o.customerEmail,
          items: o.items.length
        })),
        topProductos: topProductos.map((p) => ({
          productId: p.productId,
          nombre: p.productName,
          unidades: p._sum.quantity
        }))
      }
    });
  } catch (error: any) {
    console.error('[ADMIN-DASHBOARD] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar el dashboard.' });
  }
});

// =====================================================================
// GET /api/admin/products
// Listado con busqueda y filtros para la tabla del panel.
// =====================================================================
router.get('/products', async (req: Request, res: Response) => {
  try {
    const { search, category, estado, stockBajo, limit = '100' } = req.query;

    const where: any = {};

    if (category && category !== 'todas') {
      where.category = category as string;
    }

    if (estado === 'activos') where.isActive = true;
    if (estado === 'inactivos') where.isActive = false;

    if (stockBajo === 'true') {
      where.stock = { lte: 10 };
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
        { brand: { contains: term, mode: 'insensitive' } },
        { nameNormalized: { contains: normalize(term) } },
        { skuNormalized: { contains: normalize(term) } }
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: { priceTiers: { orderBy: { minQty: 'asc' } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      take: Math.min(Number(limit) || 100, 500)
    });

    res.json({
      success: true,
      count: products.length,
      data: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        format: p.format,
        description: p.description,
        price: p.price,
        originalPrice: p.originalPrice,
        discountPercent: p.discountPercent,
        isOffer: p.isOffer,
        stock: p.stock,
        minWholesaleQty: p.minWholesaleQty,
        image: p.image,
        badge: p.badge,
        brand: p.brand,
        isActive: p.isActive,
        priceTiers: p.priceTiers.map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice }))
      }))
    });
  } catch (error: any) {
    console.error('[ADMIN-PRODUCTS] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar los productos.' });
  }
});

// =====================================================================
// POST /api/admin/products
// Crea un producto nuevo.
// =====================================================================
router.post('/products', async (req: Request, res: Response) => {
  try {
    const {
      sku, name, category, format, description, price, stock,
      minWholesaleQty, brand, image, badge, isOffer, originalPrice,
      discountPercent, priceTiers
    } = req.body;

    if (!sku || !name || !category || !price) {
      return res.status(400).json({
        success: false,
        message: 'SKU, nombre, categoria y precio son obligatorios.'
      });
    }

    const skuNormalizado = String(sku).trim().toUpperCase();
    const existe = await prisma.product.findUnique({ where: { sku: skuNormalizado } });
    if (existe) {
      return res.status(409).json({
        success: false,
        message: `Ya existe un producto con el SKU ${skuNormalizado}.`,
        code: 'SKU_TAKEN'
      });
    }

    const stockInicial = Number(stock) || 0;
    const bodegaInicial = await prisma.warehouse.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' }
    });

    // Un producto nuevo nace en inventario: se crea su fila de stock en
    // la bodega principal en 0 y, si el panel informo un stock inicial,
    // se registra como entrada con su asiento en el kardex.
    //
    // Sin esto el producto existiria pero no estaria en ninguna bodega, y
    // despues no se podria ni ajustar ni despachar sin crear la fila a
    // mano.
    const product = await prisma.$transaction(async (tx) => {
      const creado = await tx.product.create({
        data: {
          sku: skuNormalizado,
          name: String(name).trim(),
          category,
          format: format || 'Unidad',
          description: description || '',
          price: Number(price),
          originalPrice: originalPrice ? Number(originalPrice) : null,
          discountPercent: discountPercent ? Number(discountPercent) : null,
          isOffer: Boolean(isOffer),
          stock: 0,
          minWholesaleQty: Number(minWholesaleQty) || 1,
          brand: brand || 'Amyb',
          image: image || null,
          badge: badge || null,
        // Se guarda la version sin acentos para que la busqueda
        // encuentre "jalapeno" aunque el nombre tenga tilde.
        nameNormalized: normalize(String(name)),
        skuNormalized: normalize(skuNormalizado)
      }
    });

      // El producto nace en la bodega principal con stock 0. Si el panel
      // informo un stock inicial, se registra como entrada en el kardex.
      if (bodegaInicial) {
        await tx.warehouseStock.create({
          data: {
            warehouseId: bodegaInicial.id,
            productId: creado.id,
            quantity: 0,
            reserved: 0
          }
        });

        if (stockInicial > 0) {
          await registrarMovimiento(tx, {
            warehouseId: bodegaInicial.id,
            productId: creado.id,
            type: 'entrada',
            quantity: stockInicial,
            reason: 'Stock inicial informado al crear el producto',
            reference: 'alta-producto'
          });
        }
      } else if (stockInicial > 0) {
        // No se crea el producto sin bodega si el panel informo stock:
        // perder esas unidades en silencio es peor que rechazar el alta.
        throw new Error(
          `INVENTARIO_SIN_BODEGA: no hay ninguna bodega activa donde dejar ` +
            `las ${stockInicial} unidades iniciales de ${skuNormalizado}.`
        );
      } else {
        console.error(
          `[ADMIN-PRODUCT-CREATE] ${skuNormalizado} se creo sin bodega: no hay ` +
            `ninguna bodega activa donde dejarlo en inventario.`
        );
      }

      return creado;
    });

    if (Array.isArray(priceTiers) && priceTiers.length > 0) {
      await prisma.priceTier.createMany({
        data: priceTiers
          .filter((t: any) => t.minQty > 0 && t.unitPrice > 0)
          .map((t: any) => ({
            productId: product.id,
            minQty: Number(t.minQty),
            unitPrice: Number(t.unitPrice)
          }))
      });
    }

    res.status(201).json({
      success: true,
      message: `Producto ${skuNormalizado} creado.`,
      data: product
    });
  } catch (error: any) {
    console.error('[ADMIN-PRODUCT-CREATE] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo crear el producto.' });
  }
});

// =====================================================================
// PUT /api/admin/products/:id
// Edita un producto existente, incluidas sus escalas de precio.
// =====================================================================
router.put('/products/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const body = req.body;

    const actual = await prisma.product.findUnique({ where: { id } });
    if (!actual) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }

    // Si cambia el SKU, debe seguir siendo unico
    if (body.sku && body.sku.toUpperCase() !== actual.sku) {
      const otro = await prisma.product.findUnique({
        where: { sku: body.sku.toUpperCase() }
      });
      if (otro) {
        return res.status(409).json({
          success: false,
          message: `El SKU ${body.sku.toUpperCase()} ya pertenece a otro producto.`
        });
      }
    }

    const data: any = {};
    const campos = [
      'sku', 'name', 'category', 'format', 'description', 'brand',
      'image', 'badge', 'isOffer', 'isActive'
    ];
    for (const campo of campos) {
      if (body[campo] !== undefined) data[campo] = body[campo];
    }
    // El stock NO se edita por aqui: es inventario, y el inventario se
    // mueve por PATCH /api/admin/products/:id/stock, que deja asiento en
    // el kardex. Editarlo aqui escribia el numero del producto sin tocar
    // ninguna bodega, asi que la mercaderia aparecia y desaparecia sin
    // dejar rastro.
    for (const campo of ['price', 'minWholesaleQty', 'originalPrice', 'discountPercent']) {
      if (body[campo] !== undefined) data[campo] = body[campo] === null ? null : Number(body[campo]);
    }
    if (body.stock !== undefined) {
      console.warn(
        `[ADMIN-PRODUCT-UPDATE] ${id} vino con stock desde el formulario de ` +
          `edicion y se ignoro. Para cambiar stock usar PATCH /products/:id/stock.`
      );
    }
    if (body.sku) {
      data.sku = body.sku.toUpperCase();
      data.skuNormalized = normalize(body.sku);
    }
    if (body.name) data.nameNormalized = normalize(body.name);

    const product = await prisma.product.update({ where: { id }, data });

    // Las escalas se reemplazan por completo: el admin manda la lista
    // final de lo que debe existir, no un diff.
    if (Array.isArray(body.priceTiers)) {
      await prisma.priceTier.deleteMany({ where: { productId: id } });
      const validas = body.priceTiers.filter(
        (t: any) => Number(t.minQty) > 0 && Number(t.unitPrice) > 0
      );
      if (validas.length > 0) {
        await prisma.priceTier.createMany({
          data: validas.map((t: any) => ({
            productId: id,
            minQty: Number(t.minQty),
            unitPrice: Number(t.unitPrice)
          }))
        });
      }
    }

    res.json({
      success: true,
      message: `Producto ${product.sku} actualizado.`,
      data: product
    });
  } catch (error: any) {
    console.error('[ADMIN-PRODUCT-UPDATE] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo actualizar el producto.' });
  }
});

// =====================================================================
// PATCH /api/admin/products/:id/stock
// Ajuste rapido de stock desde la tabla del panel.
// =====================================================================
router.patch('/products/:id/stock', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { stock, motivo, warehouseId } = req.body;

    if (typeof stock !== 'number' || stock < 0) {
      return res
        .status(400)
        .json({ success: false, message: 'El stock debe ser un numero mayor o igual a 0.' });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }

    // --- De que bodega se ajusta ---
    // El stock ya no vive en el producto: cada bodega tiene el suyo. Sin
    // saber cual, el ajuste seria inventar a que deposito se le sumo o se
    // le resto mercaderia.
    let bodegaId = warehouseId ?? null;

    if (!bodegaId) {
      const conStock = await prisma.warehouseStock.findMany({
        where: { productId: id },
        include: { warehouse: true },
        orderBy: { warehouse: { code: 'asc' } }
      });

      if (conStock.length === 1) {
        // Una sola bodega tiene el producto: no hay ambiguedad.
        bodegaId = conStock[0].warehouseId;
      } else if (conStock.length === 0) {
        const primera = await prisma.warehouse.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'asc' }
        });
        if (!primera) {
          return res.status(409).json({
            success: false,
            message: 'No hay bodegas activas configuradas.'
          });
        }
        bodegaId = primera.id;
      } else {
        return res.status(400).json({
          success: false,
          message:
            `El producto esta en ${conStock.length} bodegas ` +
            `(${conStock.map((c) => c.warehouse.code).join(', ')}). ` +
            `Indica en cual se hace el ajuste con "warehouseId".`,
          bodegas: conStock.map((c) => ({
            warehouseId: c.warehouseId,
            codigo: c.warehouse.code,
            nombre: c.warehouse.name,
            stock: c.quantity
          }))
        });
      }
    }

    const nuevo = Math.round(stock);

    const resultado = await prisma.$transaction(async (tx) => {
      // Si el producto no tiene fila en esta bodega (nacio antes del
      // control multi-bodega, o en otra bodega), se crea aqui en 0 para
      // poder dejar el asiento. Decirle al operador "hay 7 unidades" es
      // un dato de inventario, no una conjetura.
      await tx.warehouseStock.upsert({
        where: { warehouseId_productId: { warehouseId: bodegaId!, productId: id } },
        update: {},
        create: { warehouseId: bodegaId!, productId: id, quantity: 0, reserved: 0 }
      });

      const fila = await tx.warehouseStock.findUnique({
        where: {
          warehouseId_productId: { warehouseId: bodegaId!, productId: id }
        }
      });
      const actual = fila?.quantity ?? 0;
      const delta = nuevo - actual;

      if (delta === 0) {
        return { ok: true, anterior: actual, nuevo, sinCambio: true };
      }

      const movimiento = await registrarMovimiento(tx, {
        warehouseId: bodegaId!,
        productId: id,
        type: 'ajuste',
        quantity: delta,
        reason: motivo?.trim()
          ? `Ajuste manual: ${motivo.trim()}`
          : 'Ajuste manual desde el panel (sin motivo informado)',
        userId: req.user?.id ?? null,
        reference: 'panel'
      });

      return {
        ok: movimiento.ok,
        anterior: actual,
        nuevo,
        error: movimiento.ok ? undefined : movimiento.error
      };
    });

    if (!resultado.ok) {
      return res.status(409).json({
        success: false,
        message: 'No se pudo aplicar el ajuste de stock.'
      });
    }

    console.log(
      `[ADMIN-STOCK] ${product.sku} en ${bodegaId}: ${resultado.anterior} -> ` +
        `${resultado.nuevo}${motivo ? ` (${motivo})` : ' (SIN MOTIVO)'}`
    );

    res.json({
      success: true,
      message:
        `Stock de ${product.sku} en la bodega ${bodegaId} actualizado de ` +
        `${resultado.anterior} a ${resultado.nuevo}. Quedo registrado en el kardex.`,
      data: {
        sku: product.sku,
        warehouseId: bodegaId,
        stockAnterior: resultado.anterior,
        stockNuevo: resultado.nuevo
      }
    });
  } catch (error: any) {
    console.error('[ADMIN-STOCK] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo actualizar el stock.' });
  }
});

// =====================================================================
// DELETE /api/admin/products/:id
// Da de baja un producto sin borrarlo.
//
// No se borra de verdad: el producto queda referenciado en los pedidos
// historicos y en las facturas ya emitidas. Borrarlo romperia el
// historial y la trazabilidad tributaria.
// =====================================================================
router.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const [pedidosQueLoUsan, enCarritos] = await Promise.all([
      prisma.orderItem.count({ where: { productId: id } }),
      prisma.cartItem.count({ where: { productId: id } })
    ]);

    if (enCarritos > 0) {
      // Si esta en carritos de clientes, primero se vacian
      await prisma.cartItem.deleteMany({ where: { productId: id } });
    }

    const product = await prisma.product.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({
      success: true,
      message:
        `Producto ${product.sku} dado de baja.` +
        (pedidosQueLoUsan > 0
          ? ` Aparece en ${pedidosQueLoUsan} pedido(s) historicos, que se conservan.`
          : ''),
      data: { sku: product.sku, isActive: false, pedidosHistoricos: pedidosQueLoUsan }
    });
  } catch (error: any) {
    console.error('[ADMIN-PRODUCT-DELETE] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo dar de baja el producto.' });
  }
});

// =====================================================================
// POST /api/admin/products/:id/reactivate
// =====================================================================
router.post('/products/:id/reactivate', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const product = await prisma.product.update({
      where: { id },
      data: { isActive: true }
    });
    res.json({
      success: true,
      message: `Producto ${product.sku} reactivado.`,
      data: product
    });
  } catch (error: any) {
    console.error('[ADMIN-REACTIVATE] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo reactivar el producto.' });
  }
});

// =====================================================================
// GET /api/admin/orders
// Listado de pedidos con filtros.
// =====================================================================
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const { paymentStatus, orderStatus, search, desde, limit = '50' } = req.query;

    const where: any = {};

    if (paymentStatus && paymentStatus !== 'todos') {
      where.paymentStatus = paymentStatus as string;
    }
    if (orderStatus && orderStatus !== 'todos') {
      where.orderStatus = orderStatus as string;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customerNombre: { contains: term, mode: 'insensitive' } },
        { customerEmail: { contains: term, mode: 'insensitive' } },
        { customerTelefono: { contains: term } }
      ];
    }

    if (desde && typeof desde === 'string') {
      where.createdAt = { gte: new Date(desde) };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: true,
        user: { select: { email: true, nombre: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200)
    });

    const total = await prisma.order.count({ where });

    res.json({
      success: true,
      total,
      count: orders.length,
      data: orders.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        cliente: o.customerNombre,
        email: o.user?.email ?? o.customerEmail,
        telefono: o.customerTelefono,
        total: o.total,
        subtotal: o.subtotal,
        iva: o.iva,
        costoEnvio: o.costoEnvio,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        zona: o.shippingZoneName,
        direccion: o.shippingAddress,
        dteFolio: o.dteFolio,
        dtePdfUrl: o.dtePdfUrl,
        dteStatusLabel: o.dteStatusLabel,
        items: o.items.map((i) => ({
          nombre: i.productName,
          cantidad: i.quantity,
          precio: i.unitPrice,
          subtotal: i.subtotal
        })),
        ultimaTransaccion: o.transactions[0]
          ? {
              status: o.transactions[0].status,
              cardNumber: o.transactions[0].cardNumber,
              authorizationCode: o.transactions[0].authorizationCode
            }
          : null
      }))
    });
  } catch (error: any) {
    console.error('[ADMIN-ORDERS] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar los pedidos.' });
  }
});

// =====================================================================
// PATCH /api/admin/orders/:id/status
// Cambia el estado logistico del pedido.
//
// El estado de PAGO no se toca desde aqui: lo determina Transbank.
// El backend impide cambiarlo a mano para que nadie marque como
// pagado algo que no se cobro.
// =====================================================================
// =====================================================================
// POST /api/admin/orders/:id/reenviar-email
// Reenvia un correo del pedido reconstruyendolo desde su estado actual.
//
// El caso que resuelve: el pago se confirmo pero el aviso al cliente no
// salio (SMTP caido, proveedor rechazo, corte de red). El cliente se
// queda sin saber que pago y sin su factura. Reenviar reproduce el correo
// con el folio y el PDF ACTUALES, no el contenido guardado del intento
// fallido, que pudo quedar a medias.
// =====================================================================
router.post('/orders/:id/reenviar-email', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { tipo = 'factura' } = req.body ?? {};

    const validos: TipoCorreoPedido[] = ['factura', 'despacho', 'entrega'];
    if (!validos.includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: `Tipo invalido. Usa uno de: ${validos.join(', ')}.`
      });
    }

    const resultado = await enviarCorreoDePedido(id, tipo);

    res.json({ success: resultado.ok, data: resultado });
  } catch (error: any) {
    // Errores de negocio (pedido no pagado, cancelado) no son caidas del
    // sistema: se responden con 400 para que el panel pueda explicarlos.
    console.error('[ADMIN-EMAIL] Reenvio fallido:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// =====================================================================
// GET /api/admin/pagos/colgados
// Pagos que quedaron en 'procesando' sin resolverse nunca.
//
// Es la cola que faltaba: sin ella, un pedido que el cliente abrio y
// abandono se ve igual que uno que esta esperando confirmacion. Con un
// estado COMMITTED encima, es plata cobrada que nadie sabe que hay.
// =====================================================================
router.get('/pagos/colgados', async (req: Request, res: Response) => {
  try {
    const horas = Math.max(1, Number(req.query.horas) || 2);
    const colgados = await pagosColgados(horas);

    res.json({
      success: true,
      ventanaHoras: horas,
      total: colgados.length,
      data: colgados
    });
  } catch (error: any) {
    console.error('[ADMIN-PAGOS] Error listando colgados:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar los pagos.' });
  }
});

// =====================================================================
// POST /api/admin/pagos/expirar
// Cierra los pagos abandonados. Consulta a Transbank antes de decidir.
// =====================================================================
router.post('/pagos/expirar', async (_req: Request, res: Response) => {
  try {
    const resultado = await expirarPagosAbandonados({ horas: 2 });

    res.json({
      success: true,
      data: {
        revisados: resultado.revisados,
        expirados: resultado.expirados.length,
        cobradoSorpresivo: resultado.cobradoSorpresivo.length,
        sinResolver: resultado.sinResolver.length,
        detalle: resultado
      }
    });
  } catch (error: any) {
    console.error('[ADMIN-PAGOS] Error expirando:', error.message);
    res.status(500).json({ success: false, message: 'Error al cerrar pagos.' });
  }
});

// =====================================================================
// INVENTARIO MULTI-BODEGA
// =====================================================================
// GET /api/admin/bodegas
// Las bodegas con su stock total. Es la vista que responde "cuanto hay".
// =====================================================================
router.get('/bodegas', async (_req: Request, res: Response) => {
  try {
    const bodegas = await prisma.warehouse.findMany({
      orderBy: { code: 'asc' },
      include: {
        stocks: { select: { quantity: true, reserved: true } },
        zones: { select: { id: true, name: true, isActive: true } }
      }
    });

    res.json({
      success: true,
      data: bodegas.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        address: b.address,
        lat: b.lat,
        lng: b.lng,
        isActive: b.isActive,
        productosConStock: b.stocks.filter((s) => s.quantity > 0).length,
        unidadesTotales: b.stocks.reduce((a, s) => a + s.quantity, 0),
        unidadesReservadas: b.stocks.reduce((a, s) => a + s.reserved, 0),
        zonas: b.zones
      }))
    });
  } catch (error: any) {
    console.error('[ADMIN-INVENTARIO] Error listando bodegas:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar las bodegas.' });
  }
});

// =====================================================================
// GET /api/admin/bodegas/:id/stock
// Que hay en esa bodega, producto por producto.
// =====================================================================
router.get('/bodegas/:id/stock', async (req: Request, res: Response) => {
  try {
    const warehouseId = String(req.params.id);
    const search = String(req.query.search ?? '').trim();

    const bodega = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!bodega) {
      return res.status(404).json({ success: false, message: 'Bodega no encontrada.' });
    }

    const stocks = await prisma.warehouseStock.findMany({
      where: {
        warehouseId,
        ...(search
          ? { product: { name: { contains: search, mode: 'insensitive' } } }
          : {})
      },
      include: { product: true },
      orderBy: { product: { name: 'asc' } }
    });

    res.json({
      success: true,
      data: {
        bodega: { id: bodega.id, code: bodega.code, name: bodega.name },
        stocks: stocks.map((s) => ({
          productId: s.productId,
          sku: s.product.sku,
          nombre: s.product.name,
          format: s.product.format,
          minWholesaleQty: s.product.minWholesaleQty,
          quantity: s.quantity,
          reserved: s.reserved,
          disponible: Math.max(0, s.quantity - s.reserved)
        }))
      }
    });
  } catch (error: any) {
    console.error('[ADMIN-INVENTARIO] Error en stock de bodega:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar el stock.' });
  }
});

// =====================================================================
// GET /api/admin/productos/:id/bodegas
// Como esta repartido UN producto entre las bodegas. Responde "donde hay
// de esto", que es la pregunta que se hace cuando se agota en el punto
// principal.
// =====================================================================
router.get('/productos/:id/bodegas', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const distribucion = await distribucionDeProducto(id);

    res.json({
      success: true,
      data: distribucion.map((s) => ({
        warehouseId: s.warehouseId,
        bodega: s.warehouse.name,
        codigo: s.warehouse.code,
        quantity: s.quantity,
        reserved: s.reserved,
        disponible: Math.max(0, s.quantity - s.reserved)
      }))
    });
  } catch (error: any) {
    console.error('[ADMIN-INVENTARIO] Error en distribucion:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar la distribucion.' });
  }
});

// =====================================================================
// GET /api/admin/kardex
// El libro de movimientos, con filtros.
//
// Es de solo lectura a proposito: el kardex es append-only. Si un asiento
// quedo mal, se corrige con un movimiento nuevo que lo referencia, nunca
// editando el anterior. Por eso no hay un PUT ni un DELETE aca.
// =====================================================================
router.get('/kardex', async (req: Request, res: Response) => {
  try {
    const { productId, warehouseId, type, orderId, desde, limit = '100' } = req.query;

    const where: any = {};
    if (productId) where.productId = String(productId);
    if (warehouseId) where.warehouseId = String(warehouseId);
    if (orderId) where.orderId = String(orderId);
    if (type) where.type = String(type);
    if (desde) {
      where.createdAt = { gte: new Date(String(desde)) };
    }

    const movimientos = await prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { sku: true, name: true } },
        warehouse: { select: { code: true, name: true } },
        order: { select: { orderNumber: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 100, 500)
    });

    res.json({
      success: true,
      count: movimientos.length,
      data: movimientos.map((m) => ({
        id: m.id,
        createdAt: m.createdAt,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: m.balanceAfter,
        reason: m.reason,
        reference: m.reference,
        correctsId: m.correctsId,
        sku: m.product.sku,
        producto: m.product.name,
        bodega: m.warehouse.name,
        bodegaCode: m.warehouse.code,
        orderNumber: m.order?.orderNumber ?? null
      }))
    });
  } catch (error: any) {
    console.error('[ADMIN-KARDEX] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar el kardex.' });
  }
});

// =====================================================================
// GET /api/admin/correos/fallidos
// Correos que quedaron sin enviar, para recuperarlos uno a uno.
// =====================================================================
router.get('/correos/fallidos', async (req: Request, res: Response) => {
  try {
    const fallidos = await correosFallidos(100);

    res.json({
      success: true,
      data: fallidos.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        destinatario: e.destinatario,
        asunto: e.asunto,
        error: e.error,
        sentAt: e.sentAt,
        orderId: e.orderId,
        orderNumber: e.order?.orderNumber ?? null,
        cliente: e.order?.customerNombre ?? null
      }))
    });
  } catch (error: any) {
    console.error('[ADMIN-EMAIL] No se pudieron listar:', error.message);
    res.status(500).json({ success: false, message: 'Error al listar los correos fallidos.' });
  }
});
router.patch('/orders/:id/status', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { orderStatus, notas } = req.body;

    const validos = ['pendiente', 'pagado', 'despachado', 'entregado', 'cancelado'];
    if (!validos.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Estado invalido. Usa uno de: ${validos.join(', ')}.`
      });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });
    }

    // No se puede marcar como despachado algo que no esta pagado
    if (orderStatus === 'despachado' || orderStatus === 'entregado') {      if (order.paymentStatus !== 'pagado') {
        return res.status(409).json({
          success: false,
          message:
            'No se puede despachar un pedido que no esta pagado. ' +
            `El estado de pago actual es '${order.paymentStatus}'.`
        });
      }
    }

    const actualizado = await prisma.order.update({
      where: { id },
      data: {
        orderStatus,
        ...(notas !== undefined ? { shippingNotes: notas } : {})
      }
    });

    // --- Avisos de email al cambiar el estado ---
    // Solo se avisa cuando el pedido AVANZA, no cuando se retrocede:
    // reenviar el aviso de despacho a un pedido cancelado confunde.
    const esNuevoEstado =
      order.orderStatus !== orderStatus &&
      ['despachado', 'entregado'].includes(orderStatus);

    if (esNuevoEstado) {
      try {
        const zona = await prisma.shippingZone.findUnique({
          where: { id: order.shippingZoneId }
        });

        const mail =
          orderStatus === 'despachado'
            ? emailDespacho({
                nombre: order.customerNombre,
                orderNumber: order.orderNumber,
                zona: order.shippingZoneName,
                direccion: order.shippingAddress,
                estimatedHours: zona?.estimatedHours ?? null
              })
            : emailEntregado({
                nombre: order.customerNombre,
                orderNumber: order.orderNumber
              });

        await emailService.enviar({
          to: order.customerEmail,
          asunto: mail.asunto,
          html: mail.html,
          tipo: orderStatus === 'despachado' ? 'despacho' : 'entrega',
          orderId: order.id,
          userId: order.userId
        });
      } catch (emailError: any) {
        console.error('[ADMIN-EMAIL] No se pudo enviar el aviso:', emailError.message);
      }
    }

    // Cancelar un pedido NO repone stock, porque cancelar no repone
    // stock: un pedido IMPAGO jamas descuento mercaderia. El stock se
      // baja recien cuando Transbank confirma el pago, y ese descuento
      // esta atado a la anulacion del pago (POST /api/webpay/refund),
      // que es lo que repone.
      //
      // Antes este bloque hacia product.stock += cantidad al cancelar un
      // pedido pendiente: inventario inflado de la nada, una unidad
      // fantasma por cada pedido que se cancelaba.
      if (orderStatus === 'cancelado' && order.paymentStatus === 'pagado') {
        return res.status(409).json({
          success: false,
          message:
            `El pedido ${order.orderNumber} esta pagado. Para cancelarlo hay que ` +
            'anular el pago en Transbank primero (POST /api/webpay/refund). ' +
            'Revertir solo el stock dejaria el cobro sin mercaderia.',
          code: 'PAGO_REQUIERE_ANULACION'
        });
    }

    res.json({
      success: true,
      message: `Pedido ${actualizado.orderNumber} marcado como '${orderStatus}'.`,
      data: { orderNumber: actualizado.orderNumber, orderStatus: actualizado.orderStatus }
    });
  } catch (error: any) {
    console.error('[ADMIN-ORDER-STATUS] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo cambiar el estado.' });
  }
});

// =====================================================================
// GET /api/admin/clients
// =====================================================================
router.get('/clients', async (_req: Request, res: Response) => {
  try {
    const clients = await prisma.user.findMany({
      where: { role: 'customer' },
      select: {
        id: true,
        nombre: true,
        email: true,
        telefono: true,
        rutEmpresa: true,
        razonSocial: true,
        isActive: true,
        createdAt: true,
        // Nivel de precio asignado: el admin lo ve y lo cambia desde aca
        priceTier: {
          select: { id: true, nombre: true, descuentoPercent: true }
        },
        _count: { select: { orders: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Total comprado por cliente, para saber quien es mayorista
    const conGasto = await Promise.all(
      clients.map(async (c) => {
        const agg = await prisma.order.aggregate({
          _sum: { total: true },
          where: { userId: c.id, paymentStatus: 'pagado' }
        });
        return { ...c, totalComprado: agg._sum.total ?? 0 };
      })
    );

    conGasto.sort((a, b) => b.totalComprado - a.totalComprado);

    res.json({ success: true, count: conGasto.length, data: conGasto });
  } catch (error: any) {
    console.error('[ADMIN-CLIENTS] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar los clientes.' });
  }
});

// =====================================================================
// GET /api/admin/emails
// Buzon de salida. En desarrollo permite leer el HTML exacto que
// recibio el cliente sin configurar un servidor SMTP.
//
// IMPORTANTE: en produccion este endpoint NO debe quedar abierto.
// Responde 404 si NODE_ENV es production, para que ningun adversario
// pueda leer los correos de los clientes.
// =====================================================================
router.get('/emails', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'No encontrado.' });
  }

  try {
    const { destinatario, tipo } = req.query;

    const where: any = {};
    if (destinatario) where.destinatario = destinatario;
    if (tipo) where.tipo = tipo;

    const emails = await prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      // El HTML puede pesar; se excluye del listado y se pide aparte
      select: {
        id: true,
        tipo: true,
        destinatario: true,
        asunto: true,
        estado: true,
        error: true,
        orderId: true,
        sentAt: true,
        createdAt: true
      }
    });

    res.json({
      success: true,
      modo: emailService.esModoCaptura() ? 'captura' : 'smtp',
      count: emails.length,
      data: emails
    });
  } catch (error: any) {
    console.error('[ADMIN-EMAILS] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar los correos.' });
  }
});

// =====================================================================
// GET /api/admin/emails/:id
// Devuelve el HTML completo de un correo para previsualizarlo.
// =====================================================================
router.get('/emails/:id', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'No encontrado.' });
  }

  try {
    const email = await prisma.emailLog.findUnique({ where: { id: String(req.params.id) } });
    if (!email) {
      return res.status(404).json({ success: false, message: 'Correo no encontrado.' });
    }
    res.json({ success: true, data: email });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al cargar el correo.' });
  }
});

// =====================================================================
// NIVELES DE PRECIO DE CLIENTE
// =====================================================================
// Un nivel define el descuento que un grupo de clientes ve sobre TODA
// la tienda. Ejemplo: "Mayorista" con 8% de descuento.
// =====================================================================

router.get('/price-tiers', async (_req: Request, res: Response) => {
  try {
    const tiers = await prisma.priceTierCustomer.findMany({
      orderBy: [{ isActive: 'desc' }, { descuentoPercent: 'desc' }]
    });

    const conConteo = await Promise.all(
      tiers.map(async (t) => ({
        ...t,
        clientesAsignados: await prisma.user.count({
          where: { priceTierId: t.id, isActive: true }
        })
      }))
    );

    res.json({ success: true, count: conConteo.length, data: conConteo });
  } catch (error: any) {
    console.error('[ADMIN-TIERS] Error:', error.message);
    res.status(500).json({ success: false, message: 'Error al cargar los niveles.' });
  }
});

router.post('/price-tiers', async (req: Request, res: Response) => {
  try {
    const { nombre, descripcion, descuentoPercent, aplicaSobreEscalon, color } = req.body;

    if (!nombre || descuentoPercent === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y descuento son obligatorios.'
      });
    }

    const pct = Number(descuentoPercent);
    if (Number.isNaN(pct) || pct < 0 || pct > 90) {
      return res.status(400).json({
        success: false,
        message: 'El descuento debe estar entre 0 y 90 por ciento.'
      });
    }

    const tier = await prisma.priceTierCustomer.create({
      data: {
        nombre: String(nombre).trim(),
        descripcion: descripcion?.trim() || null,
        descuentoPercent: pct,
        aplicaSobreEscalon: Boolean(aplicaSobreEscalon),
        color: color || null
      }
    });

    res.status(201).json({ success: true, data: tier });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res
        .status(409)
        .json({ success: false, message: 'Ya existe un nivel con ese nombre.' });
    }
    console.error('[ADMIN-TIERS-CREATE] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo crear el nivel.' });
  }
});

router.put('/price-tiers/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { nombre, descripcion, descuentoPercent, aplicaSobreEscalon, color, isActive } =
      req.body;

    const data: any = {};
    if (nombre !== undefined) data.nombre = String(nombre).trim();
    if (descripcion !== undefined) data.descripcion = descripcion?.trim() || null;
    if (descuentoPercent !== undefined) {
      const pct = Number(descuentoPercent);
      if (Number.isNaN(pct) || pct < 0 || pct > 90) {
        return res.status(400).json({
          success: false,
          message: 'El descuento debe estar entre 0 y 90 por ciento.'
        });
      }
      data.descuentoPercent = pct;
    }
    if (aplicaSobreEscalon !== undefined) data.aplicaSobreEscalon = Boolean(aplicaSobreEscalon);
    if (color !== undefined) data.color = color || null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const tier = await prisma.priceTierCustomer.update({ where: { id }, data });
    res.json({ success: true, data: tier });
  } catch (error: any) {
    console.error('[ADMIN-TIERS-UPDATE] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo actualizar el nivel.' });
  }
});

/** Asigna (o quita) un nivel de precio a un cliente. */
router.post('/clients/:id/price-tier', async (req: Request, res: Response) => {
  try {
    const clientId = String(req.params.id);
    const { priceTierId } = req.body;

    if (priceTierId) {
      const existe = await prisma.priceTierCustomer.findUnique({
        where: { id: priceTierId }
      });
      if (!existe) {
        return res.status(404).json({ success: false, message: 'Nivel no encontrado.' });
      }
    }

    const user = await prisma.user.update({
      where: { id: clientId },
      data: { priceTierId: priceTierId || null },
      select: {
        id: true,
        nombre: true,
        email: true,
        priceTier: { select: { id: true, nombre: true, descuentoPercent: true } }
      }
    });

    res.json({
      success: true,
      message: priceTierId
        ? `Nivel "${user.priceTier?.nombre}" asignado a ${user.nombre}.`
        : 'Nivel de precio quitado.',
      data: user
    });
  } catch (error: any) {
    console.error('[ADMIN-CLIENT-TIER] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo asignar el nivel.' });
  }
});

// =====================================================================
// CONFIGURACION DE DESPACHO (RADIO Y GOOGLE MAPS)
// =====================================================================
router.get('/delivery-config', async (_req: Request, res: Response) => {
  try {
    const config = await deliveryService.obtenerConfig();
    // La API key nunca se devuelve completa: es una credencial
    res.json({
      success: true,
      data: {
        ...config,
        googleMapsApiKey: config.googleMapsApiKey
          ? `${config.googleMapsApiKey.slice(0, 6)}...${config.googleMapsApiKey.slice(-4)}`
          : null,
        googleMapsConfigurado: Boolean(config.googleMapsApiKey)
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al cargar la configuraciÃ³n.' });
  }
});

router.put('/delivery-config', async (req: Request, res: Response) => {
  try {
    const {
      nombreLocal,
      bodegaDireccion,
      bodegaLat,
      bodegaLng,
      radioMaximoKm,
      bloquearFueraDeRadio,
      despachoBase,
      costoPorKm,
      despachoGratisDesde,
      googleMapsApiKey
    } = req.body;

    if (radioMaximoKm !== undefined && Number(radioMaximoKm) < 0) {
      return res
        .status(400)
        .json({ success: false, message: 'El radio no puede ser negativo.' });
    }

    const config = await deliveryService.actualizarConfig({
      nombreLocal,
      bodegaDireccion,
      bodegaLat: bodegaLat != null ? Number(bodegaLat) : undefined,
      bodegaLng: bodegaLng != null ? Number(bodegaLng) : undefined,
      radioMaximoKm: radioMaximoKm != null ? Number(radioMaximoKm) : undefined,
      bloquearFueraDeRadio,
      despachoBase: despachoBase != null ? Number(despachoBase) : undefined,
      costoPorKm: costoPorKm != null ? Number(costoPorKm) : undefined,
      despachoGratisDesde:
        despachoGratisDesde != null ? Number(despachoGratisDesde) : undefined,
      googleMapsApiKey
    });

    res.json({ success: true, message: 'ConfiguraciÃ³n de despacho actualizada.', data: config });
  } catch (error: any) {
    console.error('[ADMIN-DELIVERY-CONFIG] Error:', error.message);
    res.status(500).json({ success: false, message: 'No se pudo guardar.' });
  }
});

/** Prueba la cobertura de una direccion sin crear pedido. */
router.post('/delivery-config/test', async (req: Request, res: Response) => {
  try {
    const { direccion, subtotal = 0 } = req.body;
    if (!direccion) {
      return res.status(400).json({ success: false, message: 'Direccion requerida.' });
    }
    const resultado = await deliveryService.validar(direccion, Number(subtotal) || 0);
    res.json({ success: true, data: resultado });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al probar la direcciÃ³n.' });
  }
});

export default router;
