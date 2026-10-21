/**
 * Errores con nombre y destino propio.
 *
 * El problema que resuelven: hoy cada ruta repite su propio try/catch y
 * decide a mano qué status HTTP corresponde. Hay 56 de esos lugares, y en
 * cualquiera se puede equivocar la clasificacion.
 *
 * Regla: el TIPO del error decide el status, no elLuck catch que lo atrapa.
 * Un error de validacion que sale como 500 le dice a soporte "se rompio el
 * servidor" cuando en realidad el cliente mando algo malo. Y un error de
 * negocio que sale como 400 esconde un bug real.
 *
 * Los errores de infraestructura (base caida, archivo ilegible) NO usan esta
 * jerarquia: esos son 500 de verdad y se reportan con el middleware global.
 */

/** Base de todos los errores de negocio. */
export class ErrorNegocio extends Error {
  /** Codigo estable para el cliente y para buscar en los logs. */
  readonly codigo: string;
  readonly estado: number;
  /** Si el operador tiene que enterarse (no es culpa del cliente). */
  readonly esOperativo: boolean;
  /** Contexto para el log. Nunca contiene secretos. */
  readonly detalle: Record<string, unknown>;

  constructor(
    codigo: string,
    mensaje: string,
    estado: number,
    opciones: { esOperativo?: boolean; detalle?: Record<string, unknown> } = {}
  ) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
    this.estado = estado;
    this.esOperativo = opciones.esOperativo ?? false;
    this.detalle = opciones.detalle ?? {};
  }
}

/** El cliente mando algo que no cumple las reglas. 400 */
export class ErrorValidacion extends ErrorNegocio {
  constructor(codigo: string, mensaje: string, detalle?: Record<string, unknown>) {
    super(codigo, mensaje, 400, { detalle });
  }
}

/** El cliente segelecciono reglas que no admiten el pedido. 422 */
export class ErrorReglaNegocio extends ErrorNegocio {
  constructor(
    codigo: string,
    mensaje: string,
    detalle?: Record<string, unknown>,
    estado = 422
  ) {
    super(codigo, mensaje, estado, { detalle });
  }
}

/** El recurso no existe. 404 */
export class ErrorNoEncontrado extends ErrorNegocio {
  constructor(codigo: string, mensaje: string) {
    super(codigo, mensaje, 404);
  }
}

/** El estado actual choca con lo que se pide. 409 */
export class ErrorConflicto extends ErrorNegocio {
  constructor(
    codigo: string,
    mensaje: string,
    detalle?: Record<string, unknown>,
    estado = 409
  ) {
    super(codigo, mensaje, estado, { detalle });
  }
}

/** El estado actual choca y el cliente puede reintentar. 409 */
export class ErrorStockInsuficiente extends ErrorConflicto {
  constructor(detalle: { producto: string; disponible: number; pedido: number }) {
    super(
      'INSUFFICIENT_STOCK',
      `Stock insuficiente para "${detalle.producto}". Disponibles: ${detalle.disponible}, solicitadas: ${detalle.pedido}.`,
      detalle as unknown as Record<string, unknown>
    );
  }
}

/**
 * Un tercero (Transbank, FACTO, SMTP) no pudo hacer lo suyo. 502
 *
 * No es culpa del cliente ni bug nuestro: es que la integracion fallo. Por
 * eso responde 502 y no 500, que le dice a soporte "el problema es de
 * integracion, no de codigo".
 */
export class ErrorIntegracion extends ErrorNegocio {
  constructor(
    integracion: 'transbank' | 'facto' | 'smtp' | 'google-maps',
    mensaje: string,
    detalle?: Record<string, unknown>
  ) {
    super(`INTEGRACION_${integracion.toUpperCase().replace('-', '_')}`, mensaje, 502, {
      esOperativo: true,
      detalle: { integracion, ...detalle }
    });
  }
}

/** Falta configuracion del servidor. 500, pero con codigo propio para no perderse. */
export class ErrorConfiguracion extends ErrorNegocio {
  constructor(codigo: string, mensaje: string) {
    super(codigo, mensaje, 500, { esOperativo: true });
  }
}