import nodemailer, { Transporter } from 'nodemailer';
import { prisma } from '../lib/prisma.js';
import { datoObligatorio, esProduccion } from '../config.js';

/**
 * Servicio de correo transaccional.
 *
 * DOS MODOS:
 *
 * 1. REAL: cuando hay SMTP_HOST configurado, envia de verdad con
 *    nodemailer. Es lo que se usa en produccion.
 *
 * 2. CAPTURA (por defecto en desarrollo): NO envia nada. Guarda el
 *    email completo en la tabla email_logs para poder leerlo en el
 *    navegador. Sin esto, en desarrollo nunca se veria un correo
 *    real y los errores de plantilla aparecerian tarde, en produccion.
 *
 * En ambos casos se registra en email_logs, asi que hay auditoria de
 * que se le notifico a cada cliente.
 */

export type EmailTipo =
  | 'confirmacion_orden'
  | 'factura'
  | 'despacho'
  | 'recuperacion_password'
  | 'entrega';

interface EnviarParams {
  to: string;
  asunto: string;
  html: string;
  tipo: EmailTipo;
  orderId?: string | null;
  // Acepta null: un pedido puede hacerse como invitado, sin cuenta
  // asociada, y el registro del correo igual se guarda.
  userId?: string | null;
}

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

/** Desde que remitente salen los correos. */
function remitente(): { nombre: string; email: string } {
  return {
    nombre: datoObligatorio(
      'EMAIL_FROM_NAME',
      'Amyb Distribuidora',
      'el nombre del remitente de los correos'
    ),
    email: datoObligatorio(
      'EMAIL_FROM',
      'no-reply@amybdistribuidora.cl',
      'la direccion del remitente de los correos'
    )
  };
}

let transporter: Transporter | null = null;

/** El envio real solo se activa si hay SMTP configurado. */
function smtpConfigurado(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function obtenerTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      // El puerto 465 usa SSL directo; el 587 usa STARTTLS.
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return transporter;
}

export const emailService = {
  /** Indica si los correos salen de verdad o solo se guardan. */
  esModoCaptura(): boolean {
    return !smtpConfigurado();
  },

  /**
   * Envia un email y lo registra.
   * NUNCA lanza: si el correo falla, el pedido ya esta guardado y no
   * debe caerse por un problema de SMTP. El error queda en el log.
   */
  async enviar(params: EnviarParams): Promise<boolean> {
    const { to, asunto, html, tipo, orderId, userId } = params;

    if (!to) {
      console.warn(`[EMAIL] ${tipo}: sin destinatario, se omite.`);
      return false;
    }

    if (this.esModoCaptura()) {
      // En produccion, quedarse en modo captura es el peor resultado
      // posible: no falla, no avisa y el cliente nunca recibe nada. Ni
      // se registra el pago al cliente ni la factura con su PDF.
      if (esProduccion()) {
        throw new Error(
          `CONFIGURACION_FALTANTE: no hay SMTP configurado y NODE_ENV=production. ` +
            `El correo "${tipo}" a ${to} NO se envio y el sistema iba a guardarlo ` +
            `solo en la base. Configurar SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS ` +
            `y EMAIL_FROM antes de recibir pedidos reales.`
        );
      }

      await prisma.emailLog.create({
        data: {
          tipo,
          destinatario: to,
          asunto,
          estado: 'simulado',
          htmlGuardado: html,
          orderId: orderId ?? null,
          userId: userId ?? null
        }
      });
      console.log(`[EMAIL-SIMULADO] ${tipo} -> ${to} (guardado para revisar)`);
      return true;
    }

    try {
      const desde = remitente();
      await obtenerTransporter().sendMail({
        from: `"${desde.nombre}" <${desde.email}>`,
        to,
        subject: asunto,
        html
      });

      await prisma.emailLog.create({
        data: {
          tipo,
          destinatario: to,
          asunto,
          estado: 'enviado',
          orderId: orderId ?? null,
          userId: userId ?? null
        }
      });

      console.log(`[EMAIL] ${tipo} enviado a ${to}`);
      return true;
    } catch (error: any) {
      console.error(`[EMAIL] Error enviando ${tipo} a ${to}:`, error.message);
      await prisma.emailLog.create({
        data: {
          tipo,
          destinatario: to,
          asunto,
          estado: 'fallido',
          error: error.message,
          orderId: orderId ?? null,
          userId: userId ?? null
        }
      });
      return false;
    }
  },

  /** Historial de correos, para revisar en desarrollo. */
  async listar(limite = 50) {
    return prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limite
    });
  },

  async obtener(id: string) {
    return prisma.emailLog.findUnique({ where: { id } });
  }
};
