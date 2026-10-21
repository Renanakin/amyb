/**
 * Estado de un documento en el SII, ya interpretado.
 *
 * FACTO responde "enviado, en proceso" y el SII contesta despues. Un
 * documento puede ser rechazado horas despues de emitirlo, y sin mirar
 * ese estado el sistema muestra "procesado" como si fuera definitivo.
 *
 * Estos codigos son los que publica FACTO Chile:
 *
 *   document_status
 *     0  Borrador
 *     1  Emitido
 *
 *   taxbureau_send_status   (envio al SII)
 *     1      Enviado correctamente, contenido en proceso
 *     101-110 Error TEMPORAL: FACTO reintenta solo cada ~5 minutos
 *     201-206 Error PERMANENTE: FACTO no reintenta, hay que reemitir
 *
 *   taxbureau_validation_status   (validacion del SII)
 *     3  Aprobado
 *     4  Aprobado con observaciones
 *     5  Rechazado
 *
 * Que un documento este 'aprobado' no es lo mismo que 'aun en proceso',
 * y la diferencia es la que separa una factura valida de una que el SII
 * rechazo en silencio.
 */

export type EstadoSii =
  | 'aprobado'
  | 'observado'
  | 'rechazado'
  | 'procesando'
  | 'reintentando'
  | 'error_permanente'
  | 'desconocido';

export interface VeredictoSii {
  estado: EstadoSii;
  etiqueta: string;
  /** Requiere intervencion humana o reemision. */
  accionable: boolean;
  /** Que hay que hacer, en concreto. */
  accion: string;
  /** Estado transitorio: conviene revisar mas tarde, no ahora. */
  transitorio: boolean;
}

/** Error de envio temporal: FACTO lo reintenta solo. */
const ERROR_ENVIO_TEMPORAL_MIN = 101;
const ERROR_ENVIO_TEMPORAL_MAX = 110;
/** Error de envio permanente: FACTO no reintenta nunca. */
const ERROR_ENVIO_PERMANENTE_MIN = 201;
const ERROR_ENVIO_PERMANENTE_MAX = 206;

export function clasificarEstadoSii(respuesta: any): VeredictoSii {
  // Sin respuesta util no se inventa un estado optimista.
  if (!respuesta || typeof respuesta !== 'object') {
    return {
      estado: 'desconocido',
      etiqueta: 'No se pudo consultar el estado en FACTO',
      accionable: true,
      accion: 'Revisar manualmente en el portal de FACTO.',
      transitorio: true
    };
  }

  if (respuesta.error) {
    return {
      estado: 'desconocido',
      etiqueta: `Error al consultar el estado: ${respuesta.error}`,
      accionable: true,
      accion: 'Revisar manualmente en el portal de FACTO.',
      transitorio: true
    };
  }

  // Un documento simulado NUNCA se puede reportar como aprobado por el
  // SII: no existe para el SII. Se comprueba antes que nada porque el
  // resto de codigos, en una simulacion, dicen "aprobado" sin significar
  // nada.
  if (respuesta.isSandbox === true || respuesta.sandbox === true) {
    return {
      estado: 'procesando',
      etiqueta:
        'SIN validacion real del SII (simulado o sin credenciales de FACTO)',
      accionable: true,
      accion:
        'No es una factura validada. Activar las credenciales de FACTO antes ' +
        'de operar con clientes; en desarrollo esto es lo esperado.',
      transitorio: false
    };
  }

  // FACTO devuelve los campos en snake_case, pero el simulador interno y
  // algunos endpoints los usan en camelCase. Se aceptan ambos para no
  // terminar con un NaN y un estado 'desconocido' permanente.
  const send = Number(
    respuesta.taxbureau_send_status ?? respuesta.taxbureauSendStatus
  );
  const validation = Number(
    respuesta.taxbureau_validation_status ?? respuesta.taxbureauValidationStatus
  );

  // El SII manda sobre el estado del envio: si rechazo, no hay nada que
  // esperar aunque FACTO lo haya enviado bien.
  if (validation === 5) {
    return {
      estado: 'rechazado',
      etiqueta: 'RECHAZADO POR EL SII - la factura NO es valida',
      accionable: true,
      accion:
        'Reemitir el documento: el rechazo suele ser un dato malo (RUT del ' +
        'receptor, direccion, folios agotados). Corregir la causa antes de ' +
        'reemitir o se rechaza igual. npm run dte:reintentar',
      transitorio: false
    };
  }

  if (validation === 4) {
    return {
      estado: 'observado',
      etiqueta: 'Aprobado por el SII con observaciones',
      accionable: false,
      accion: 'Revisar las observaciones del documento en el portal de FACTO.',
      transitorio: false
    };
  }

  if (validation === 3) {
    return {
      estado: 'aprobado',
      etiqueta: 'Aprobado por el SII',
      accionable: false,
      accion: '',
      transitorio: false
    };
  }

  if (send >= ERROR_ENVIO_PERMANENTE_MIN && send <= ERROR_ENVIO_PERMANENTE_MAX) {
    return {
      estado: 'error_permanente',
      etiqueta: 'Error PERMANENTE de envio al SII - FACTO no reintentara',
      accionable: true,
      accion: 'Reemitir el documento. Un error permanente nunca se resuelve solo.',
      transitorio: false
    };
  }

  if (send >= ERROR_ENVIO_TEMPORAL_MIN && send <= ERROR_ENVIO_TEMPORAL_MAX) {
    return {
      estado: 'reintentando',
      etiqueta: 'Error temporal de envio: FACTO esta reintentando solo',
      accionable: false,
      accion: 'Esperar. Si en unas horas sigue igual, reintentar el envio.',
      transitorio: true
    };
  }

  if (send === 1 || send === 0) {
    return {
      estado: 'procesando',
      etiqueta: 'Enviado al SII, en proceso de validacion',
      accionable: false,
      accion: '',
      transitorio: true
    };
  }

  return {
    estado: 'desconocido',
    etiqueta: `Estado no reconocido (send=${send}, validation=${validation})`,
    accionable: true,
    accion: 'Revisar manualmente en el portal de FACTO.',
    transitorio: false
  };
}