/**
 * Salud del servicio.
 *
 * El health check anterior respondia 200 SIEMPRE, sin tocar nada. Eso
 * miente: si PostgreSQL esta caido la tienda no puede vender nada, y el
 * monitoreo (o el balanceador) recibia "todo bien". Durante el desarrollo
 * de este modulo el propio backend reportandose sano con la base caida
 * fue lo que hizo perder tiempo.
 *
 * Que se compruebe la base NO significa que el servicio este caido: el
 * proceso puede estar vivo perfectamente y no poder atender pedidos. Por
 * eso se separa:
 *
 *   /api/health/live  ¿el proceso responde?        (no mira nada mas)
 *   /api/health       ¿el servicio puede atender?  (mira la base)
 *
 * Un balanceador debe usar /live para no mandar trafico a un proceso
 * muerto, y /health (o un chequeo externo) para avisar de verdad.
 */

export interface EstadoConfig {
  baseDatos: 'ok' | 'error' | 'timeout';
  /** Avisos que no impiden operar, pero hay que mirar. */
  avisos: string[];
}

export interface ResultadoSalud {
  ok: boolean;
  estado: 'ok' | 'degraded';
  checks: {
    baseDatos: EstadoConfig['baseDatos'];
    latenciaBaseDatosMs: number | null;
  };
  avisos: string[];
  uptimeSegundos: number;
  version: string;
}

export const VERSION_APP = '2.0.0 (MobileFirst + Fallback Ready)';

/**
 * Corre `probe` con un plazo. Si no responde a tiempo se considera caida:
 * una consulta que se queda colgada es tan inútil como una que falla.
 */
async function conPlazo<T>(
  probe: () => Promise<T>,
  ms: number
): Promise<{ ok: true; valor: T } | { ok: false; error: 'timeout' | 'error' }> {
  let temporizador: NodeJS.Timeout | undefined;

  try {
    const promesa = probe();
    const limite = new Promise<never>((_, reject) => {
      temporizador = setTimeout(
        () => reject(new Error('timeout')),
        ms
      );
    });

    const valor = await Promise.race([promesa, limite]);
    return { ok: true, valor };
  } catch (e: any) {
    const esTimeout =
      e?.message === 'timeout' || e?.name === 'TimeoutError';
    return { ok: false, error: esTimeout ? 'timeout' : 'error' };
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

export async function evaluarSalud(
  probeBaseDatos: () => Promise<unknown>,
  ms = 3000
): Promise<ResultadoSalud> {
  const inicio = Date.now();
  const resultado = await conPlazo(probeBaseDatos, ms);
  const latencia = resultado.ok ? Date.now() - inicio : null;

  const baseDatos: EstadoConfig['baseDatos'] = resultado.ok
    ? 'ok'
    : resultado.error;

  const avisos: string[] = [];

  if (baseDatos !== 'ok') {
    avisos.push(
      baseDatos === 'timeout'
        ? 'PostgreSQL no respondio dentro del plazo: la tienda no puede atender pedidos.'
        : 'No se pudo conectar a PostgreSQL: la tienda no puede atender pedidos.'
    );
  }

  // Avisos que no impiden vender, pero que conviene mirar antes de
  // recibir clientes de verdad. Solo se comparan variables: no se llama a
  // Transbank ni al SII desde un endpoint que el monitoreo consulta cada
  // pocos segundos.
  if (!(process.env.SMTP_HOST ?? '').trim()) {
    avisos.push(
      'SMTP sin configurar: en produccion el servidor no arrancaria y los correos no salen.'
    );
  }
  if (!(process.env.FACTO_CLIENT_ID ?? '').trim()) {
    avisos.push(
      'FACTO sin credenciales: las facturas quedan simuladas y sin valor ante el SII.'
    );
  }
  if (!(process.env.WEBPAY_COMMERCE_CODE ?? '').trim()) {
    avisos.push(
      'Transbank sin credenciales: los pagos no se pueden autorizar.'
    );
  }

  return {
    ok: baseDatos === 'ok',
    estado: baseDatos === 'ok' ? 'ok' : 'degraded',
    checks: { baseDatos, latenciaBaseDatosMs: latencia },
    avisos,
    uptimeSegundos: Math.round(process.uptime()),
    version: VERSION_APP
  };
}