import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { datoObligatorio } from '../config.js';
import { FactoService } from '../services/factoService.js';
import { enviarCorreoDePedido } from '../services/notificaciones.js';
import {
  registrarMovimiento,
  resolverBodegaDePedido,
  resolverBodegaParaReposicion
} from '../services/inventario.js';
import { emailService } from '../services/emailService.js';
import { emailPagoAprobado } from '../services/emailTemplates.js';
import {
  WebpayPlusService,
  describeResponseCode
} from '../services/webpayService.js';

const router = Router();
const webpay = new WebpayPlusService();

/**
 * Genera el identificador visible del pedido.
 * Usa una secuencia de Postgres, no Math.random(): el prototipo anterior
 * generaba el numero con aleatoriedad y colisionaba con volumen real.
 * Formato: AMYB-2026-000123
 *
 * El regex del filtro evita que un sufijo alfanumerico antiguo (por
 * ejemplo TEST01) rompa el cast a integer.
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
// POST /api/webpay/init
// Crea la transaccion en Transbank y devuelve la URL de la pasarela.
// =====================================================================
router.post('/init', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId es obligatorio.'
      });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado.'
      });
    }

    if (order.paymentMethod !== 'webpay') {
      return res.status(400).json({
        success: false,
        message: 'El pedido no fue creado con metodo de pago Webpay.'
      });
    }

    if (order.paymentStatus === 'pagado') {
      return res.status(409).json({
        success: false,
        message: 'Este pedido ya se encuentra pagado.'
      });
    }

    // Idempotencia en la creacion: si ya existe una transaccion abierta
    // para esta orden, se devuelve la misma en vez de generar otra.
    // Sin este control, un doble clic en "Pagar" crearia dos transacciones
    // y el cliente podria ser cobrado dos veces.
    const openTxn = await prisma.webpayTransaction.findFirst({
      where: {
        orderId: order.id,
        status: { in: ['INITIATED', 'COMMITTED'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (openTxn?.token) {
      return res.json({
        success: true,
        data: {
          url: `${webpay.getBaseUrl()}/webpayserver/initTransaction`,
          token: openTxn.token,
          amount: openTxn.amount,
          orderNumber: order.orderNumber,
          reused: true
        }
      });
    }

    if (order.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'El pedido no tiene productos.'
      });
    }

    if (!webpay.isConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          'Webpay no esta configurado. Revisa WEBPAY_COMMERCE_CODE y WEBPAY_API_KEY_SECRET en el .env'
      });
    }

    // buy_order: Transbank admite hasta 26 caracteres alfanumericos.
    // El ID interno de Prisma (cuid) puede excederlo, por eso se usa
    // el orderNumber de negocio que ya tiene formato fijo.
    const buyOrder = order.orderNumber;
    if (buyOrder.length > 26) {
      return res.status(500).json({
        success: false,
        message: `El orderNumber "${buyOrder}" excede los 26 caracteres que admite Transbank.`
      });
    }

    const sessionId = order.id; // identificador de la sesion de compra

    // Verificacion de stock antes de cobrar. Es la ultima barrera: si no
    // hay stock, nunca se debe abrir la pasarela de pago.
    for (const item of order.items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { name: true, stock: true }
      });
      if (!product || product.stock < item.quantity) {
        await prisma.order.update({
          where: { id: order.id },
          data: { orderStatus: 'cancelado' }
        });
        return res.status(409).json({
          success: false,
          message: `Sin stock suficiente para "${item.productName}". Stock disponible: ${
            product?.stock ?? 0
          }, solicitado: ${item.quantity}.`,
          code: 'INSUFFICIENT_STOCK'
        });
      }
    }

    // A donde vuelve el cliente despues de pagar. Si esto no esta
    // definido en produccion, el cliente paga y aterriza en localhost:
    // se lleva el cargo sin ver nada. Por eso no hay valor por defecto
    // en produccion.
    const returnUrl = datoObligatorio(
      'WEBPAY_RETURN_URL',
      `http://localhost:${process.env.PORT || 3001}/api/webpay/return`,
      'devolver al cliente a la pagina de resultado tras autorizar el pago'
    );

    const transaction = await webpay.createTransaction(
      buyOrder,
      sessionId,
      order.total,
      returnUrl
    );

    // Se registra el token ANTES de redirigir. Si el commit falla a
    // mitad de camino, ya existe el registro para poder reconciliar.
    await prisma.webpayTransaction.create({
      data: {
        orderId: order.id,
        token: transaction.token,
        buyOrder,
        sessionId,
        amount: order.total,
        returnUrl,
        status: 'INITIATED'
      }
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'procesando' }
    });

    res.json({
      success: true,
      data: {
        // El frontend debe construir un form POST a 'url' con token_ws
        url: transaction.url,
        token: transaction.token,
        amount: order.total,
        orderNumber: order.orderNumber
      }
    });
  } catch (error: any) {
    console.error('[WEBPAY-INIT] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'No se pudo iniciar el pago con Transbank.',
      detail: error.message
    });
  }
});

// =====================================================================
// POST /api/webpay/commit
// Confirma server-to-server que el pago fue autorizado.
// Puede invocarse manualmente o desde el retorno automatico.
// =====================================================================
router.post('/commit', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'token es obligatorio.'
      });
    }

    const result = await processCommit(token);

    res.status(result.authorized ? 200 : 402).json({
      success: result.authorized,
      message: result.message,
      data: result
    });
  } catch (error: any) {
    console.error('[WEBPAY-COMMIT] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al confirmar la transaccion con Transbank.',
      detail: error.message
    });
  }
});

/**
 * Anula un pago ya autorizado en Transbank y deja el pedido coherente
 * con el inventario.
 *
 * `reponeStock` es el parametro que mas importa:
 *   - true  = el pago confirmo un pedido que YA desconto stock, asi que
 *             al anular hay que devolver las unidades.
 *   - false = la transaccion de base de datos se revirtio y el stock
 *             NUNCA se desconto. Reponer en ese caso INFLARIA el
 *             inventario y crearia mercaderia fantasma.
 *
 * Devuelve `{ ok: false }` en vez de lanzar para que quien la llame
 * decida que hacer. Nunca se pierde en silencio una plata cobrada: si la
 * anulacion falla, el pedido queda marcado explicitamente para reintento.
 */
async function anularPago(opts: {
  token: string;
  orderId: string;
  motivo: string;
  reponeStock: boolean;
  respuestaCommit?: any;
}): Promise<{ ok: boolean; refund?: any; error?: string }> {
  const { token, orderId, motivo, reponeStock, respuestaCommit } = opts;

  try {
    // amount 0 = anulacion TOTAL. En tarjeta de debito Transbank solo
    // permite anular dentro del mismo dia habilitacion de la operacion,
    // asi que este camino no puede quedar para la semana siguiente.
    const refund = await webpay.refundTransaction(token, 0);

    await prisma.$transaction(async (tx) => {
      await tx.webpayTransaction.update({
        where: { token },
        data: {
          status: 'REFUNDED',
          rawResponse: JSON.stringify({
            commit: respuestaCommit ?? null,
            anulacion: { motivo, reponeStock, respuesta: refund }
          })
        }
      });

      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'reembolsado', orderStatus: 'cancelado' }
      });

      if (reponeStock) {
        // La mercaderia vuelve a la bodega de la que salio, con su
        // asiento en el kardex: una devolucion es un movimiento mas, no
        // un numero que se corrige por fuera del libro.
        //
        // Un pedido pagado antes de que existieran las bodegas no tiene
        // bodega asignada, y ESO NO puede hacer fallar la anulacion: si
        // fallara, la venta quedaria con la plata devuelta y el stock sin
        // reponer, sin forma de arreglarlo.
        const pedido = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true }
        });

        if (!pedido || pedido.items.length === 0) {
          throw new Error(
            `INVENTARIO_SIN_ITEMS: el pedido ${orderId} no tiene items que reponer.`
          );
        }

        for (const item of pedido.items) {
          const warehouseId = await resolverBodegaParaReposicion(tx, {
            id: orderId,
            warehouseId: pedido.warehouseId,
            productId: item.productId
          });

          const movimiento = await registrarMovimiento(tx, {
            warehouseId,
            productId: item.productId,
            type: 'entrada',
            quantity: item.quantity,
            reason: `Anulacion de venta ${pedido.orderNumber}: la mercaderia vuelve a bodega`,
            orderId,
            reference: `anulacion-${orderId}`
          });

          if (!movimiento.ok) {
            throw new Error(
              `No se pudo reponer el stock de "${item.productName}": ${movimiento.error}`
            );
          }
        }
      }
    });

    return { ok: true, refund };
  } catch (error: any) {
    // La anulacion fallo: el cliente sigue con la plata cobrada y el
    // pedido sin despachar. Se deja un estado visible para el panel y un
    // reintento por operador.
    await prisma
      .$transaction(async (tx) => {
        await tx.webpayTransaction.update({
          where: { token },
          data: {
            status: 'REFUND_PENDING',
            rawResponse: JSON.stringify({
              commit: respuestaCommit ?? null,
              anulacion: { motivo, ok: false, error: error.message }
            })
          }
        });
        await tx.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: 'reembolso_pendiente',
            orderStatus: 'cancelado'
          }
        });
      })
      .catch((e) =>
        console.error('[WEBPAY-ANULAR] No se pudo marcar el pedido:', e.message)
      );

    return { ok: false, error: error.message };
  }
}

/**
 * Emite (o reintenta emitir) el DTE de un pedido ya pagado.
 *
 * Vive fuera del flujo de commit para que el reintento manual use
 * EXACTAMENTE la misma logica: si el SII estaba caido en el momento del
 * pago, el operador debe poder emitir el documento despues sin duplicar
 * codigo ni arriesgarse a otra version de la logica.
 *
 * Devuelve true si el pedido quedo con documento asociado.
 */
export async function emitirDteParaPedido(orderId: string): Promise<boolean> {
  const paid = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });

  if (!paid) return false;
  if (paid.dteDocumentId) return true; // ya emitido, no se duplica

  const facto = await FactoService.emitDte({
    orderId: paid.orderNumber,
    documentType: paid.dteTipoDocumento === 'factura' ? 'factura' : 'boleta',
    customer: {
      nombre: paid.customerNombre,
      email: paid.customerEmail,
      telefono: paid.customerTelefono,
      rutEmpresa: paid.dteRutEmpresa ?? undefined,
      razonSocial: paid.dteRazonSocial ?? undefined,
      giroComercial: paid.dteGiroComercial ?? undefined,
      direccionTributaria: paid.dteDireccion ?? undefined,
      comunaTributaria: paid.dteComuna ?? undefined
    },
    items: paid.items.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      price: i.unitPrice,
      format: i.productFormat
    })),
    subtotal: paid.subtotal,
    iva: paid.iva,
    total: paid.total
  });

  if (!facto?.success) {
    throw new Error(facto?.error || 'FACTO no devolvio un documento valido.');
  }

  await prisma.order.update({
    where: { id: paid.id },
    data: {
      dteFolio: String(facto.folio),
      dteDocumentId: facto.documentId,
      dtePdfUrl: facto.pdfUrl,
      dteXmlUrl: facto.xmlUrl,
      dteStatusLabel: facto.statusLabel
    }
  });

  return true;
}

/**
 * Logica compartida entre /commit y /return.
 *
 * IDEMPOTENCIA: el commit de Transbank es de un solo uso. Si el cliente
 * recarga la pagina de retorno, repetir el PUT devuelve 422/400. Por eso
 * se consulta primero si el token ya fue procesado y, de ser asi, se
 * devuelve el resultado guardado en vez de re-intentar.
 */
async function processCommit(token: string) {
  const existing = await prisma.webpayTransaction.findUnique({
    where: { token },
    include: { order: true }
  });

  if (!existing) {
    throw new Error('Transaccion no registrada en el sistema.');
  }

  // --- Idempotencia: si ya se confirmo, devolver el resultado guardado ---
  if (existing.status === 'AUTHORIZED') {
    return {
      authorized: true,
      message: 'Pago ya confirmado anteriormente.',
      alreadyProcessed: true,
      orderId: existing.orderId,
      orderNumber: existing.order.orderNumber,
      amount: existing.amount,
      cardNumber: existing.cardNumber,
      authorizationCode: existing.authorizationCode,
      paymentTypeCode: existing.paymentTypeCode
    };
  }

  if (existing.status === 'REJECTED') {
    return {
      authorized: false,
      message: 'El pago ya fue rechazado en una intento anterior.',
      alreadyProcessed: true,
      orderId: existing.orderId,
      orderNumber: existing.order.orderNumber
    };
  }

  // El token ya se uso y la plata fue devuelta. Volver a confirmar aqui
  // intentaria cobrar de nuevo: se devuelve el estado real y se detiene.
  if (existing.status === 'REFUNDED') {
    return {
      authorized: false,
      message: 'El pago de este pedido fue anulado.',
      alreadyProcessed: true,
      refunded: true,
      orderId: existing.orderId,
      orderNumber: existing.order.orderNumber
    };
  }

  if (existing.status === 'REFUND_PENDING') {
    return {
      authorized: false,
      message:
        'El pago de este pedido quedo pendiente de anulacion. Nuestro equipo ya fue notificado.',
      alreadyProcessed: true,
      refundPending: true,
      orderId: existing.orderId,
      orderNumber: existing.order.orderNumber
    };
  }

  // Marcar como COMMITTED ANTES de llamar a Transbank. Si el proceso muere
  // justo despues del PUT, la reconcilacion puede recuperar el estado real.
  await prisma.webpayTransaction.update({
    where: { token },
    data: { status: 'COMMITTED' }
  });

  let response;
  try {
    response = await webpay.commitTransaction(token);
  } catch (error: any) {
    // "Transaction already locked by another process": Transbank esta
    // procesando ESTE MISMO token en paralelo (tipicamente porque la
    // pagina de retorno se cargo dos veces o el usuario recargó).
    //
    // El commit NO es idempotente a nivel de Transbank: la segunda
    // llamada falla aunque la primera haya funcionado. Por eso, ante
    // este error se consulta el estado REAL en Transbank en vez de
    // marcar el pago como fallido. Si ya esta AUTHORIZED, el pago se
    // dio y se continua por el camino de exito.
    // Un fallo de red NO significa que el cobro no ocurrio: Transbank
    // pudo autorizar y la respuesta perderse en el camino (timeout,
    // corte de fibra, reinicio del proceso). Si aqui se da el cobro por
    // perdido, el cliente ve "el pago fallo", reintenta, y la tienda
    // queda con la plata cobrada y sin pedido.
    //
    // La unica fuente de verdad es Transbank, asi que ante CUALQUIER error
    // del commit se consulta el estado real. Antes solo se hacia con el
    // error "already locked", y cualquier otro fallo se daba por perdido.
    const isLocked = /already locked/i.test(error.message);

    console.warn(
      `[WEBPAY-COMMIT] El commit del token ${token} fallo ` +
        `(${isLocked ? 'token bloqueado' : error.message}). Consultando el ` +
        `estado real en Transbank para no dar por perdido un cobro que pudo ` +
        `haberse concretado.`
    );

    const remoto = await webpay.getTransactionStatus(token).catch((e: any) => {
      console.error(
        `[WEBPAY-COMMIT] No se pudo consultar el estado en Transbank: ${e.message}`
      );
      return null;
    });

    // Estados en los que Transbank responde de forma DEFINITIVA que no
    // se cobro. Solo estos permiten reabrir el pedido. Cualquier otra
    // cosa (null, vacio, un estado que no conocemos) NO es prueba de que
    // no se cobro: es falta de informacion, y reabrir ahi permitiria un
    // segundo cobro de un pago que si pudo concretarse.
    const ESTADOS_SIN_COBRO = ['REJECTED', 'ABORTED', 'FAILED', 'INITIATED'];

    if (remoto?.status === 'AUTHORIZED') {
      // Si cobro de verdad: se sigue el camino de exito normal.
      console.warn(
        `[WEBPAY-COMMIT] Transbank confirma que el pago SI se autorizo ` +
          `(${remoto.amount} CLP). Se continua con la confirmacion del pedido.`
      );
      response = {
        vci: remoto.vci,
        amount: remoto.amount,
        status: remoto.status,
        buy_order: remoto.buy_order,
        session_id: remoto.session_id,
        card_detail: remoto.card_detail,
        accounting_date: remoto.accounting_date,
        transaction_date: remoto.transaction_date,
        authorization_code: remoto.authorization_code,
        payment_type_code: remoto.payment_type_code,
        response_code: remoto.response_code ?? 0,
        installments_number: remoto.installments_number
      } as any;
    } else if (remoto && ESTADOS_SIN_COBRO.includes(remoto.status)) {
      // Transbank responde y confirma que NO se cobro: reabrir el pedido
      // para un reintento es seguro.
      await prisma.webpayTransaction.update({
        where: { token },
        data: {
          status: 'INITIATED',
          rawResponse: JSON.stringify({
            commitError: error.message,
            estadoRemoto: remoto
          })
        }
      });
      throw error;
    } else {
      // NO se pudo determinar el estado: no responde ni el commit ni la
      // consulta. A proposito NO se reabre el pedido: reabrirlo permitiria
      // un segundo cobro de un pago que pudo haberse concretado.
      //
      // La transaccion queda en COMMITTED, que aqui significa "no sabemos",
      // y pagos:reconciliar la resuelve consultando Transbank despues. Al
      // cliente se le dice la verdad: estamos verificando.
      await prisma.webpayTransaction.update({
        where: { token },
        data: {
          status: 'COMMITTED',
          rawResponse: JSON.stringify({
            commitError: error.message,
            estadoRemoto: null,
            nota: 'Sin respuesta de Transbank. Estado desconocido, pendiente de reconciliar.'
          })
        }
      });

      return {
        authorized: false,
        paymentPendingVerification: true,
        message:
          'Estamos verificando tu pago con la pasarela. Si el cargo no se confirma, la plata se devuelve automáticamente.',
        orderId: existing.orderId,
        orderNumber: existing.order.orderNumber
      };
    }
  }

  const authorized = response.status === 'AUTHORIZED' && response.response_code === 0;

  // Validaciones de seguridad: el monto y el buy_order devueltos por
  // Transbank deben coincidir con los de nuestra orden. Si no coinciden,
  // algo se manipulo en el camino y no se debe marcar como pagado.
  const amountMatches = response.amount === existing.amount;
  const orderMatches = response.buy_order === existing.buyOrder;

  if (authorized && (!amountMatches || !orderMatches)) {
    console.error(
      `[WEBPAY] DISCREPANCIA en token ${token}: monto ${response.amount} vs ${existing.amount}, orden ${response.buy_order} vs ${existing.buyOrder}`
    );
    await prisma.webpayTransaction.update({
      where: { token },
      data: {
        status: 'REJECTED',
        responseCode: response.response_code,
        rawResponse: JSON.stringify(response)
      }
    });
    await prisma.order.update({
      where: { id: existing.orderId },
      data: { paymentStatus: 'rechazado', orderStatus: 'cancelado' }
    });
    return {
      authorized: false,
      message:
        'El pago no coincide con el pedido. Contacta a soporte para resolver.',
      orderId: existing.orderId,
      orderNumber: existing.order.orderNumber
    };
  }

  if (authorized) {
    // --- Transaccion atomica: confirmar pago + descontar stock ---
    //
    // OJO: Transbank YA autorizo y la plata YA salio de la cuenta del
    // cliente en este punto. Si esta transaccion falla, el cliente queda
    // con la plata cobrada y sin pedido. Por eso el fallo se atiende
    // dentro del codigo y se anula el pago antes de responder. Sin esto,
    // dos clientes compitiendo por la ultima unidad dejan a uno cobrado
    // y sin entrega, y el reembolso queda en manos de que alguien se
    // entere a tiempo.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.webpayTransaction.update({
          where: { token },
          data: {
            status: 'AUTHORIZED',
            responseCode: response.response_code,
            authorizationCode: response.authorization_code,
            cardNumber: response.card_detail?.card_number,
            paymentTypeCode: response.payment_type_code,
            installments: response.installments_number,
            accountingDate: response.accounting_date,
            transactionDate: new Date(response.transaction_date),
            rawResponse: JSON.stringify(response)
          }
        });

        // El stock se descuenta DE LA BODEGA que va a despachar, no de un
        // numero agregado del producto. El pedido ya tiene bodega
        // asignada; si se creo antes de existirlas, se resuelve ahora y se
        // persiste, para que quede dicho de donde salio la venta.
        const items = await tx.orderItem.findMany({
          where: { orderId: existing.orderId }
        });

        const pedido = await tx.order.findUnique({
          where: { id: existing.orderId }
        });

        const warehouseId = await resolverBodegaDePedido(
          tx,
          {
            id: existing.orderId,
            shippingZoneId: pedido?.shippingZoneId ?? '',
            warehouseId: pedido?.warehouseId ?? null
          },
          items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
        );

        for (const item of items) {
          const movimiento = await registrarMovimiento(tx, {
            warehouseId,
            productId: item.productId,
            type: 'salida',
            quantity: -item.quantity,
            reason: `Venta ${existing.order.orderNumber}`,
            orderId: existing.orderId,
            reference: existing.buyOrder ?? null
          });

          if (!movimiento.ok) {
            // Se revierte toda la transaccion: no se puede cobrar sin stock.
            throw new Error(
              movimiento.error === 'STOCK_INSUFICIENTE'
                ? `Stock insuficiente en la bodega para "${item.productName}" al momento de confirmar (disponible: ${movimiento.saldo}, pedido: ${item.quantity}).`
                : `No hay registro de stock para "${item.productName}" en la bodega de despacho.`
            );
          }
        }

        await tx.order.update({
          where: { id: existing.orderId },
          data: { paymentStatus: 'pagado', orderStatus: 'pagado' }
        });
      });
    } catch (commitError: any) {
      const motivo =
        commitError?.message || 'Error desconocido al confirmar el pago.';

      // El catch tambien cubre fallos que no son de stock (por ejemplo
      // la base de datos caida). El mensaje al cliente debe decir la
      // verdad: si fue stock agotado se lo decimos, y si fue otra cosa
      // tampoco prometemos un motivo que no conocemos.
      const esFaltaDeStock = motivo.startsWith('Stock insuficiente');

      console.error(
        `[WEBPAY-COMPROMISO] Transbank autorizo ${response.amount} CLP en el pedido ` +
          `${existing.order.orderNumber} pero no se pudo confirmar: ${motivo}. ` +
          `Iniciando anulacion para no cobrar sin despachar.`
      );

      // reponeStock: false. La transaccion de arriba hizo rollback, asi
      // que el stock NUNCA se desconto. Reponerlo crearia mercaderia
      // que nunca salio de la bodega.
      const anulacion = await anularPago({
        token,
        orderId: existing.orderId,
        motivo,
        reponeStock: false,
        respuestaCommit: response
      });

      if (anulacion.ok) {
        return {
          authorized: false,
          message: esFaltaDeStock
            ? 'Tu pago fue anulado porque el stock se agotó mientras confirmabamos el pedido. No se realizó ningún cargo.'
            : 'Tu pago fue anulado porque no pudimos confirmar el pedido a tiempo. No se realizó ningún cargo.',
          orderId: existing.orderId,
          orderNumber: existing.order.orderNumber,
          refunded: true,
          stockIncident: esFaltaDeStock
        };
      }

      // La anulacion automatica fallo: la plata sigue cobrada y el pedido
      // quedo marcado como reembolso_pendiente. El panel lo muestra para
      // que un operador lo reintente, y tiene que ser HOY: en tarjeta de
      // debito Transbank solo permite anular dentro del mismo dia habil
      // de habilitacion de la operacion.
      return {
        authorized: false,
        message:
          'Tu pago quedó pendiente de devolución. Nuestro equipo ya fue notificado y te devolveremos el dinero.',
        orderId: existing.orderId,
        orderNumber: existing.order.orderNumber,
        refunded: false,
        refundPending: true,
        stockIncident: esFaltaDeStock
      };
    }

    // --- Emision del DTE ---
    // Se hace DESPUES de confirmar el pago, nunca antes. Un documento
    // tributario respalda una venta que ocurrio; emitirlo cuando el
    // banco todavia no ha autorizado generaria boletas de ventas que
    // nunca se cobraron.
    try {
      await emitirDteParaPedido(existing.orderId);
    } catch (factoError: any) {
      // El pago ya esta confirmado y el stock descontado. Si falla la
      // emision, el pedido queda pagado sin documento, que es preferible
      // a perder la venta. Se marca de forma visible para que el operador
      // lo vea en el panel y lo reintente con: npm run dte:reintentar
      console.error(
        `[WEBPAY-DTE] Pago confirmado pero fallo la emision del DTE: ${factoError.message}`
      );

      // Solo se marca si el pedido NO tiene documento: si ya tenia uno
      // emitido, esta etiqueta nueva no debe pisar el estado real.
      await prisma.order
        .updateMany({
          where: { id: existing.orderId, dteDocumentId: null },
          data: {
            dteStatusLabel:
              'PENDIENTE DE EMISION - el SII/FACTO no respondio. Reintentar con npm run dte:reintentar'
          }
        })
        .catch((e) =>
          console.error('[WEBPAY-DTE] No se pudo marcar el pedido:', e.message)
        );
    }

    // --- Aviso de pago aprobado con la factura adjunta ---
    // Se manda despues de emitir el DTE para que el correo incluya el
    // folio y el link de descarga.
    //
    // Se usa la misma funcion que el reenvio manual, para que un correo
    // reenviado sea identico al que salio la primera vez.
    try {
      const resultado = await enviarCorreoDePedido(
        existing.orderId,
        'factura'
      );
      if (!resultado.ok) {
        console.error(
          `[WEBPAY-EMAIL] El pago se confirmo pero el aviso al cliente no salio: ${resultado.message}`
        );
      }
    } catch (emailError: any) {
      // El pedido YA esta pagado y con stock descontado. Un correo que no
      // sale no puede perder la venta: se deja anotado en email_logs y se
      // recupera con POST /api/admin/orders/:id/reenviar-email
      console.error(
        `[WEBPAY-EMAIL] No se pudo enviar el aviso de pago: ${emailError.message}`
      );
    }
  } else {
    // Pago rechazado: no se descuenta stock, la orden queda cancelada.
    await prisma.$transaction([
      prisma.webpayTransaction.update({
        where: { token },
        data: {
          status: 'REJECTED',
          responseCode: response.response_code,
          rawResponse: JSON.stringify(response)
        }
      }),
      prisma.order.update({
        where: { id: existing.orderId },
        data: { paymentStatus: 'rechazado', orderStatus: 'cancelado' }
      })
    ]);
  }

  return {
    authorized,
    message: authorized
      ? 'Pago autorizado correctamente.'
      : describeResponseCode(response.response_code),
    orderId: existing.orderId,
    orderNumber: existing.order.orderNumber,
    amount: response.amount,
    cardNumber: response.card_detail?.card_number,
    authorizationCode: response.authorization_code,
    paymentTypeCode: response.payment_type_code,
    installments: response.installments_number,
    transactionDate: response.transaction_date
  };
}

// =====================================================================
// GET/POST /api/webpay/return
// Destino del redireccionamiento de Transbank tras el pago.
// Aplica la matriz de estados definida por la guia.
// =====================================================================
const handleReturn = async (req: Request, res: Response) => {
  try {
    const tokenWs = (req.body?.token_ws || req.query?.token_ws) as string | undefined;

    // --- Caso 1: pago completado ---
    if (tokenWs) {
      const result = await processCommit(tokenWs);
      return res.json({
        success: result.authorized,
        message: result.message,
        data: result
      });
    }

    // --- Caso 2: el usuario hizo clic en "Volver al comercio" ---
    const tbkToken = (req.body?.TBK_TOKEN || req.query?.TBK_TOKEN) as string | undefined;
    if (tbkToken) {
      const txn = await prisma.webpayTransaction.findUnique({
        where: { token: tbkToken }
      });
      if (txn) {
        await prisma.webpayTransaction.update({
          where: { token: tbkToken },
          data: { status: 'ABORTED' }
        });
        await prisma.order.update({
          where: { id: txn.orderId },
          data: { paymentStatus: 'pendiente', orderStatus: 'pendiente' }
        });
      }
      return res.json({
        success: false,
        message: 'Cancelaste el pago. Tu pedido sigue reservado.',
        data: { status: 'ABORTED_BY_USER' }
      });
    }

    // --- Caso 3: timeout en la pasarela ---
    const ordenCompra = (req.body?.TBK_ORDEN_COMPRA ||
      req.query?.TBK_ORDEN_COMPRA) as string | undefined;
    if (ordenCompra) {
      const txn = await prisma.webpayTransaction.findFirst({
        where: { buyOrder: ordenCompra }
      });
      if (txn) {
        await prisma.webpayTransaction.update({
          where: { id: txn.id },
          data: { status: 'TIMED_OUT' }
        });
        await prisma.order.update({
          where: { id: txn.orderId },
          data: { paymentStatus: 'pendiente', orderStatus: 'pendiente' }
        });
      }
      return res.json({
        success: false,
        message:
          'La transaccion expiro por tiempo. Puedes reintentar el pago desde tu pedido.',
        data: { status: 'TIMED_OUT' }
      });
    }

    res.status(400).json({
      success: false,
      message: 'Retorno de Transbank sin parametros reconocibles.'
    });
  } catch (error: any) {
    console.error('[WEBPAY-RETURN] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error procesando el retorno de Transbank.',
      detail: error.message
    });
  }
};

router.get('/return', handleReturn);
router.post('/return', handleReturn);

// =====================================================================
// GET /api/webpay/status/:token
// Reconciliacion: consulta el estado real en Transbank.
// Util si el commit quedo pendiente por corte de red.
// =====================================================================
router.get('/status/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token);

    if (!webpay.isConfigured()) {
      return res
        .status(503)
        .json({ success: false, message: 'Webpay no esta configurado.' });
    }

    const local = await prisma.webpayTransaction.findUnique({
      where: { token },
      include: { order: true }
    });

    const remote = await webpay.getTransactionStatus(token);

    res.json({
      success: true,
      data: {
        local: {
          status: local?.status,
          amount: local?.amount,
          orderNumber: local?.order.orderNumber,
          orderId: local?.orderId
        },
        transbank: remote
      }
    });
  } catch (error: any) {
    console.error('[WEBPAY-STATUS] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'No se pudo consultar el estado en Transbank.',
      detail: error.message
    });
  }
});

// =====================================================================
// POST /api/webpay/refund
// Anulacion de un pago ya autorizado. Tambien es el reintento de los
// pedidos que quedaron en 'reembolso_pendiente'.
// =====================================================================
router.post('/refund', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: 'Pedido no encontrado.' });
    }

    // 'reembolso_pendiente' = el pago se cobro pero la anulacion automatica
    // fallo (tipicamente por stock agotado). Reintentarla es obligatorio y
    // urgente: en tarjeta de debito la ventana de anulacion es de un dia.
    if (!['pagado', 'reembolso_pendiente'].includes(order.paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Solo se pueden anular pedidos pagados o pendientes de anulacion. Estado actual: '${order.paymentStatus}'.`
      });
    }

    // Una venta ya facturada NO se anula devolviendo la plata.
    //
    // En Chile un documento tributario no se borra: la factura queda en
    // el libro del SII para siempre. Si devolvemos el dinero y dejamos
    // la factura emitida, el cliente tiene una factura por una compra
    // que no ocurrio y Amyb tiene que responder por esa diferencia.
    //
    // El camino correcto es el contrario: primero la Nota de Credito
    // (tipo 61) en FACTO, que es gratuita, y recien despues la plata.
    // Se bloquea aqui para que el paso tributario no se pueda saltar por
    // un clic en el panel.
    if (order.dteDocumentId) {
      return res.status(409).json({
        success: false,
        message:
          'Este pedido ya tiene factura emitida, asi que no se puede devolver ' +
          'la plata solamente. Primero hay que emitir la Nota de Credito que ' +
          'anula la factura en el SII y despues anular el pago.',
        dte: {
          folio: order.dteFolio,
          tipo: order.dteTipoDocumento,
          documentId: order.dteDocumentId,
          yaAnulada: Boolean(order.dteAnulacionFolio),
          notaCreditoFolio: order.dteAnulacionFolio
        },
        siguientePaso:
          'Emitir en FACTO una Nota de Credito (tipo 61) que referencie el folio ' +
          `${order.dteFolio}, motivo "anulacion de venta". FACTO la emite gratis ` +
          'para documentos ya enviados al SII. Luego registrar la nota y repetir ' +
          'esta anulacion. Revisar la cola con: npm run nc:revisar'
      });
    }

    // El stock solo se repone si el pedido llego a descontarlo. En un
    // reembolso_pendiente la transaccion de confirmacion hizo rollback y
    // el stock nunca se toco: reponerlo ahi inventaria mercaderia.
    const reponeStock = order.paymentStatus === 'pagado';

    const txn = await prisma.webpayTransaction.findFirst({
      where: {
        orderId,
        status: reponeStock ? 'AUTHORIZED' : 'REFUND_PENDING'
      },
      orderBy: { createdAt: 'desc' }
    });
    if (!txn?.token) {
      return res
        .status(404)
        .json({ success: false, message: 'No hay transaccion Webpay asociada.' });
    }

    const anulacion = await anularPago({
      token: txn.token,
      orderId,
      motivo: reponeStock
        ? 'Anulacion manual solicitada desde el panel'
        : 'Reintento de anulacion automatica que habia fallado',
      reponeStock
    });

    if (!anulacion.ok) {
      return res.status(502).json({
        success: false,
        message:
          'Transbank rechazo la anulacion. El pedido sigue marcado para reintento.',
        detail: anulacion.error
      });
    }

    res.json({
      success: true,
      message: reponeStock
        ? 'Pago anulado y stock re-integrado.'
        : 'Pago anulado. El stock no se repuso porque nunca se habia descontado.',
      data: anulacion.refund
    });
  } catch (error: any) {
    console.error('[WEBPAY-REFUND] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'No se pudo anular el pago.',
      detail: error.message
    });
  }
});

export { generateOrderNumber, anularPago, processCommit };
export default router;
