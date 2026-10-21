/**
 * Correos de un pedido: que corresponden, como se arman y como se
 * reenvian.
 *
 * Por que existe: si el pago se confirma y el envio del correo falla, el
 * cliente se queda sin saber que pago y sin su factura. Antes no habia
 * ninguna forma de reenviarlo: el fallo quedaba anotado en email_logs y
 * nadie mas lo miraba. Para un comprador B2B la factura es lo que le
 * permite pagar yDescending a contabilidad, asi que no es un detalle.
 *
 * Al reenviar se RECONSTRUYE el correo desde el estado actual del pedido,
 * no se repite el HTML guardado: el original pudo quedar a medias (por
 * ejemplo sin el folio, si la factura se emitio despues) y reenviar ese
 * contenido le mandaria al cliente una factura incompleta otra vez.
 */
import { prisma } from '../lib/prisma.js';
import { emailService } from './emailService.js';
import {
  emailPagoAprobado,
  emailDespacho,
  emailEntregado
} from './emailTemplates.js';

export type TipoCorreoPedido = 'factura' | 'despacho' | 'entrega';

export interface ResultadoEnvio {
  ok: boolean;
  to: string;
  asunto: string;
  message: string;
  /** Tipo tal como queda registrado en email_logs. */
  tipo: string;
}

export async function enviarCorreoDePedido(
  orderId: string,
  tipo: TipoCorreoPedido
): Promise<ResultadoEnvio> {
  const pedido = await prisma.order.findUnique({
    where: { id: orderId },
    include: { transactions: { orderBy: { createdAt: 'desc' }, take: 1 } }
  });

  if (!pedido) {
    throw new Error(`Pedido ${orderId} no encontrado.`);
  }

  const ultimaTransaccion = pedido.transactions[0];
  let mail: { asunto: string; html: string };
  let tipoLog: string;

  switch (tipo) {
    case 'factura': {
      // No se manda "pago aprobado" de una venta que no ocurrio. Si el
      // pedido no esta pagado, el reenvio es un error del operador, no
      // algo que el sistema deba deducir por su cuenta.
      if (!['pagado', 'reembolsado'].includes(pedido.paymentStatus)) {
        throw new Error(
          `No se puede enviar la factura de ${pedido.orderNumber}: el pedido ` +
            `esta '${pedido.paymentStatus}', no pagado.`
        );
      }

      mail = emailPagoAprobado({
        nombre: pedido.customerNombre,
        orderNumber: pedido.orderNumber,
        total: pedido.total,
        dteFolio: pedido.dteFolio,
        dteTipo: pedido.dteTipoDocumento,
        pdfUrl: pedido.dtePdfUrl,
        autorizacionCode: ultimaTransaccion?.authorizationCode,
        cardNumber: ultimaTransaccion?.cardNumber
      });
      tipoLog = 'factura';
      break;
    }

    case 'despacho': {
      if (pedido.orderStatus === 'cancelado') {
        throw new Error(
          `No se avisa de despacho un pedido cancelado: confunde al cliente.`
        );
      }
      const zona = await prisma.shippingZone.findUnique({
        where: { id: pedido.shippingZoneId }
      });

      mail = emailDespacho({
        nombre: pedido.customerNombre,
        orderNumber: pedido.orderNumber,
        zona: pedido.shippingZoneName,
        direccion: pedido.shippingAddress,
        estimatedHours: zona?.estimatedHours ?? null
      });
      tipoLog = 'despacho';
      break;
    }

    case 'entrega': {
      if (pedido.orderStatus === 'cancelado') {
        throw new Error(
          `No se avisa de entrega un pedido cancelado: confunde al cliente.`
        );
      }
      mail = emailEntregado({
        nombre: pedido.customerNombre,
        orderNumber: pedido.orderNumber
      });
      tipoLog = 'entrega';
      break;
    }

    default:
      throw new Error(`Tipo de correo no soportado: ${tipo}`);
  }

  const ok = await emailService.enviar({
    to: pedido.customerEmail,
    asunto: mail.asunto,
    html: mail.html,
    tipo: tipoLog as any,
    orderId: pedido.id,
    userId: pedido.userId
  });

  return {
    ok,
    to: pedido.customerEmail,
    asunto: mail.asunto,
    tipo: tipoLog,
    message: ok
      ? `Correo "${tipo}" reenviado a ${pedido.customerEmail}.`
      : `No se pudo enviar a ${pedido.customerEmail}. Revisa la configuracion de SMTP.`
  };
}

/**
 * Correos que quedaron sin enviar, con el pedido al que pertenecen.
 *
 * Sirve para dos cosas: para verlos en el panel y para que el script
 * `correos:fallidos` pueda reenviar en lote.
 */
export async function correosFallidos(limite = 50) {
  return prisma.emailLog.findMany({
    where: { estado: 'fallido' },
    include: { order: true },
    orderBy: { createdAt: 'desc' },
    take: limite
  });
}