/**
 * Pagos abandonados: la salida del estado `procesando`.
 *
 * `POST /api/webpay/init` pone el pedido en 'procesando' para que el panel
 * muestre que hay un pago en curso. Ese estado se escribia en un solo lugar
 * del codigo y NINGUN otro lo revertia: si el cliente abria la pasarela y
 * cerraba el navegador, si la tarjeta rebotaba o si Transbank no
 * redirigia, el pedido se quedaba en 'procesando' para siempre. El panel
 * miente sin avisar, porque un pedido que nadie pago se ve igual que uno
 * que esta esperando confirmacion.
 *
 * Regla de este modulo: NO se asume que el pago fallo, se pregunta.
 *
 * Antes de dar un pago por abandonado se consulta a Transbank. Si
 * Transbank no responde, el pago NO se toca: se reporta y se revisa
 * despues. Darlo por perdido a ciegas seria inventar el estado, que es
 * justo el error que este modulo viene a corregir.
 */
import { prisma } from '../lib/prisma.js';
import { WebpayPlusService } from './webpayService.js';

/** Estados en los que una transaccion ya no se puede cobrar. */
const ESTADOS_TERMINADOS = ['AUTHORIZED', 'REJECTED', 'REFUNDED', 'ABORTED'];

export interface ResultadoExpiracion {
  revisados: number;
  expirados: Array<{ orderId: string; orderNumber: string; token: string | null }>;
  /** Transacciones que NO se tocaron porque no se pudo saber la verdad. */
  sinResolver: Array<{ orderNumber: string; motivo: string }>;
  /** Transbank dijo que si estan autorizadas: hay que reconciliar. */
  cobradoSorpresivo: Array<{ orderNumber: string; token: string | null }>;
}

export interface OpcionesExpiracion {
  /** Horas de antiguedad para considerar el pago abandonado. */
  horas?: number;
  /** Consultar a Transbank antes de expirar. */
  consultarTransbank?: boolean;
  /** No ejecutar, solo informar. */
  soloSimular?: boolean;
}

export async function expirarPagosAbandonados(
  opciones: OpcionesExpiracion = {}
): Promise<ResultadoExpiracion> {
  const horas = opciones.horas ?? 2;
  const consultarTransbank = opciones.consultarTransbank ?? true;
  const corte = new Date(Date.now() - horas * 3600 * 1000);

  const candidatos = await prisma.webpayTransaction.findMany({
    where: {
      status: 'INITIATED',
      createdAt: { lt: corte }
    },
    include: { order: true },
    orderBy: { createdAt: 'asc' },
    take: 100
  });

  const resultado: ResultadoExpiracion = {
    revisados: candidatos.length,
    expirados: [],
    sinResolver: [],
    cobradoSorpresivo: []
  };

  if (candidatos.length === 0) return resultado;

  const webpay = new WebpayPlusService();

  for (const txn of candidatos) {
    // El token es lo unico que identifica el pago real. Sin el, no hay
    // nada que consultar y no se inventa nada.
    if (!txn.token) {
      resultado.sinResolver.push({
        orderNumber: txn.order.orderNumber,
        motivo: 'la transaccion no tiene token'
      });
      continue;
    }

    // Si Transbank ya lo dio por terminado, no hay nada que hacer.
    if (ESTADOS_TERMINADOS.includes(txn.status)) continue;

    if (consultarTransbank) {
      let remoto: any;
      try {
        remoto = await webpay.getTransactionStatus(txn.token);
      } catch (e: any) {
        // Transbank no responde: NO se toca. Se reporta para la
        // proxima pasada, cuando quizas la red ya mejoro.
        resultado.sinResolver.push({
          orderNumber: txn.order.orderNumber,
          motivo: `Transbank no responde: ${e.message}`
        });
        continue;
      }

      if (remoto?.status === 'AUTHORIZED') {
        // Siesta cobrado despues de todo. No se "expira": se marca
        // COMMITTED para que pagos:reconciliar lo resuelva con el mismo
        // camino que cualquier otro pago sin confirmar.
        if (!opciones.soloSimular) {
          await prisma.webpayTransaction.update({
            where: { id: txn.id },
            data: {
              status: 'COMMITTED',
              rawResponse: JSON.stringify({
                nota: 'Detectado cobrado despues de la ventana de abandono.',
                estadoRemoto: remoto,
                detectadoPor: 'pagos:expirar'
              })
            }
          });
        }
        resultado.cobradoSorpresivo.push({
          orderNumber: txn.order.orderNumber,
          token: txn.token
        });
        continue;
      }

      if (remoto?.status && remoto.status !== 'INITIATED') {
        // Transbank dice que esta en un estado terminal que no es
        // AUTHORIZED (REJECTED, ABORTED...). Se refleja igual.
        if (!opciones.soloSimular) {
          await prisma.webpayTransaction.update({
            where: { id: txn.id },
            data: {
              status: remoto.status,
              rawResponse: JSON.stringify({
                nota: 'Estado real consultado por pagos:expirar.',
                estadoRemoto: remoto
              })
            }
          });
        }
        continue;
      }
    }

    // Llego aqui: Transbank dice que la transaccion sigue INITIATED,
    // o sea que nadie la pago y nadie la termino. Ahi si se puede cerrar.
    if (opciones.soloSimular) {
      resultado.expirados.push({
        orderId: txn.orderId,
        orderNumber: txn.order.orderNumber,
        token: txn.token
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.webpayTransaction.update({
        where: { id: txn.id },
        data: {
          status: 'ABORTED',
          rawResponse: JSON.stringify({
            nota: `Pago cerrado por abandono: ${horas} h sin actividad.`,
            cerradoPor: 'pagos:expirar'
          })
        }
      });

      // El pedido vuelve a pendiente para que el cliente pueda reintentar.
      // Solo si sigue en 'procesando': si mientras tanto se confirmo, no
      // se toca.
      await tx.order.updateMany({
        where: { id: txn.orderId, paymentStatus: 'procesando' },
        data: { paymentStatus: 'pendiente' }
      });
    });

    resultado.expirados.push({
      orderId: txn.orderId,
      orderNumber: txn.order.orderNumber,
      token: txn.token
    });
  }

  return resultado;
}

/**
 * Pagos que quedaron en 'procesando' y que el panel debe mostrar.
 *
 * Sin esto, el operador no tiene forma de saber que hay pedidos colgados:
 * el dashboard solo contaba 'reembolso_pendiente'.
 */
export async function pagosColgados(horas = 2) {
  const corte = new Date(Date.now() - horas * 3600 * 1000);

  const pedidos = await prisma.order.findMany({
    where: {
      paymentStatus: 'procesando',
      createdAt: { lt: corte }
    },
    include: {
      transactions: {
        where: { status: { in: ['INITIATED', 'COMMITTED'] } },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    },
    orderBy: { createdAt: 'asc' },
    take: 100
  });

  return pedidos.map((p) => ({
    orderId: p.id,
    orderNumber: p.orderNumber,
    total: p.total,
    cliente: p.customerNombre,
    email: p.customerEmail,
    creadoEn: p.createdAt,
    minutosAbierto: Math.round((Date.now() - p.createdAt.getTime()) / 60000),
    transaccion: p.transactions[0]
      ? {
          estado: p.transactions[0].status,
          token: p.transactions[0].token,
          // COMMITTED = el commit se mando y no se supo el resultado.
          requiereReconciliacion: p.transactions[0].status === 'COMMITTED'
        }
      : null
  }));
}