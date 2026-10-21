/**
 * Manejo centralizado de errores.
 *
 * En vez de que cada ruta repita su try/catch y decida a mano el status,
 * se lanza el error con su tipo y este middleware decide por el. Una sola
 * puerta para los cuatro casos:
 *
 *   1. Error de negocio con tipo  -> status y codigo que trae el propio error
 *   2. Error de negocio sin tipo -> se clasifica por el prefijo del mensaje
 *   3. Error raro de integracion -> 502 con codigo de la integracion
 *   4. Cualquier otra cosa       -> 500 con codigo ESTABIL, no el mensaje real
 *
 * El punto 2 existe porque el codigo ya venia usando prefijos en el mensaje
 * (INVENTARIO_SIN_BODEGA:, FACTO_CHILE_..., etc.). Clasificar por ahi evita
 * reescribir 56 catch de una, sin dejar de tener un codigo por tipo.
 *
 * El punto 4 es deliberado: al cliente nunca se le manda el mensaje real de
 * una excepcion. Puede traer detalles internos de la base. El detalle va al
 * log, con su codigo, no a la respuesta.
 */
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ErrorNegocio } from '../errors.js';

/**
 * Asigna un identificador a cada peticion.
 *
 * Sin esto, para reconstruir que paso con un pedido hay que ir buscando por
 * numero de token en los logs, a mano. Con esto se busca el id y sale todo:
 * calculo, pago, documento, correo y movimiento de inventario.
 *
 * Si el proxy o el navegador manda `X-Request-Id`, se respeta: asi el id
 * sobrevive a que el cliente reintente y se pueden correlacionar los dos
 * intentos, que es justo el caso del corte de red.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const entrante = req.headers['x-request-id'];
  const id =
    typeof entrante === 'string' && entrante.trim().length > 0 && entrante.length <= 64
      ? entrante.trim()
      : randomUUID();

  (req as any).requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export function manejadorDeErrores(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Si ya se respondio, no se vuelve a responder. Un throw dentro de un
  // bloque que ya mando su json landinga en el middleware y, sin esto,
  // corria el riesgo de "Cannot set headers after they are sent".
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = (req as any).requestId ?? '-';

  // --- 1 y 2: errores de negocio ---
  if (err instanceof ErrorNegocio) {
    registrar(err.codigo, err.message, req, requestId, err.esOperativo, err.detalle);

    if (!err.esOperativo) {
      console.warn(`[${requestId}] ${err.codigo}: ${err.message}`);
    }

    res.status(err.estado).json({
      success: false,
      code: err.codigo,
      message: err.message,
      ...(Object.keys(err.detalle).length > 0 ? { detalle: err.detalle } : {}),
      requestId
    });
    return;
  }

  const mensaje = err instanceof Error ? err.message : String(err);
  const prefijo = mensaje.split(':')[0];

  // Prefijos que ya existen en el codigo actual.
  const PREFIJOS_NEGOCIO: Record<string, number> = {
    INSUFFICIENT_STOCK: 409,
    NO_STOCK_IN_WAREHOUSE: 409,
    OUT_OF_DELIVERY_RANGE: 422,
    BELOW_MINIMUM: 422,
    PAGO_REQUIERE_ANULACION: 409,
    SKU_TAKEN: 409,
    FORBIDDEN: 403,
    MOVIMIENTO_INVALIDO: 500,
    INVENTARIO_SIN_ITEMS: 500,
    INVENTARIO_SIN_BODEGA: 500
  };

  const PREFIJOS_CONFIGURACION = new Set([
    'CONFIGURACION_FALTANTE',
    'CONFIGURACION_INVALIDA',
    'FACTO_CHILE_SIN_CREDENCIALES',
    'FACTO_CHILE_DATO_FALTANTE',
    'FACTO_CHILE_RESPUESTA_SIN_FOLIO',
    'FACTO_CHILE_RUT_RECEPTOR_FALTANTE'
  ]);

  const PREFIJOS_INTEGRACION = new Set([
    'INVENTARIO_SIN_BODEGA_ACTIVA',
    'TRANSBANK',
    'FACTO',
    'SMTP'
  ]);

  // --- 2: error de negocio disfrazado de Error plano ---
  if (PREFIJOS_CONFIGURACION.has(prefijo)) {
    console.error(`[${requestId}] CONFIG ${prefijo}: ${mensaje}`);
    res.status(500).json({
      success: false,
      code: prefijo,
      message: 'Falta configuracion del servidor para completar la operacion.',
      requestId
    });
    return;
  }

  if (PREFIJOS_NEGOCIO[prefijo]) {
    console.warn(`[${requestId}] ${prefijo}: ${mensaje}`);
    res.status(PREFIJOS_NEGOCIO[prefijo]).json({
      success: false,
      code: prefijo,
      message: mensaje.split(':').slice(1).join(':').trim() || mensaje,
      requestId
    });
    return;
  }

  if (PREFIJOS_INTEGRACION.has(prefijo)) {
    console.error(`[${requestId}] INTEGRACION ${prefijo}: ${mensaje}`);
    res.status(502).json({
      success: false,
      code: prefijo,
      message: 'Un servicio externo no respondio. Intenta nuevamente en unos minutos.',
      requestId
    });
    return;
  }

  // --- 4: lo que no se sabe que es ---
  // El mensaje real NUNCA sale. Va al log con su codigo.
  console.error(
    `[${requestId}] ERROR_NO_CLASIFICADO ${req.method} ${req.originalUrl}: ${mensaje}`
  );
  if (err instanceof Error && err.stack) console.error(err.stack);

  res.status(500).json({
    success: false,
    code: 'ERROR_NO_CLASIFICADO',
    message:
      'Ocurrio un error inesperado. Nuestro equipo ya fue notificado; si el problema ' +
      'continua, comunicate con nosotros quoting el codigo de referencia.',
    requestId
  });
}

/** 404 para rutas que no existen. Debe montarse despues de todas las rutas. */
export function noEncontrado(req: Request, res: Response): void {
  const requestId = (req as any).requestId ?? '-';
  res.status(404).json({
    success: false,
    code: 'RUTA_NO_ENCONTRADA',
    message: `La ruta ${req.method} ${req.originalUrl} no existe.`,
    requestId
  });
}

function registrar(
  codigo: string,
  mensaje: string,
  req: Request,
  requestId: string,
  esOperativo: boolean,
  detalle: Record<string, unknown>
): void {
  const extra = Object.keys(detalle).length > 0 ? ` ${JSON.stringify(detalle)}` : '';
  console.error(
    `[${requestId}] ${codigo} (${req.method} ${req.originalUrl})` +
      `${esOperativo ? ' [OPERATIVO]' : ''}: ${mensaje}${extra}`
  );
}