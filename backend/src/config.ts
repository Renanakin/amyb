/**
 * Configuracion del sistema.
 *
 * UNA SOLA fuente para leer el .env y una sola regla:
 *
 *   Un dato que NO se puede adivinar no tiene valor por defecto.
 *   Si falta, el sistema falla diciendo que variable falta y para que
 *   se necesita. En desarrollo se puede usar un valor de prueba, pero
 *   se declara explicitamente y se avisa por consola.
 *
 * Por que importa: un valor por defecto silencioso es el modo mas
 * barato de que un sistema falle en produccion sin que nadie se entere.
 * Los casos reales que motivationaron esto:
 *
 *   - El RUT del emisor cayo en un RUT inventado, asi que cada factura
 *     salia a nombre de un contribuyente que no existe.
 *   - account_id cayo en la cuenta del sandbox, asi que con
 *     credenciales reales los documentos se iban al ambiente erroneo.
 *   - WEBPAY_RETURN_URL cayo en localhost: el cliente pagaba y caia en
 *     una direccion que no existe.
 *   - SMTP sin configurar en produccion caia en "modo captura": no
 *     fallaba, simplemente los correos nunca salian.
 *
 * La regla de oro: un default solo es aceptable si es de desarrollo, es
 * visible en el codigo y dice quien lo reemplaza en produccion.
 */

/** Datos ya avisados por consola, para no repetir el mismo mensaje. */
const yaAvisados = new Set<string>();

export function esProduccion(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Lee una variable que NO se puede adivinar.
 *
 * @param variable       nombre de la variable de entorno
 * @param valorDesarrollo valor usado solo fuera de produccion
 * @param paraQue        para que se necesita, va en el mensaje de error
 * @throws en produccion si la variable esta vacia
 */
export function datoObligatorio(
  variable: string,
  valorDesarrollo: string,
  paraQue: string
): string {
  const valor = (process.env[variable] ?? '').trim();
  if (valor) return valor;

  if (esProduccion()) {
    throw new Error(
      `CONFIGURACION_FALTANTE: falta ${variable} en el .env del servidor. ` +
        `Se necesita para ${paraQue}. El sistema no sigue con valores por ` +
        `defecto porque un dato inventado produce documentos o pagos ` +
        `incorrectos sin avisar.`
    );
  }

  if (!yaAvisados.has(variable)) {
    yaAvisados.add(variable);
    console.warn(
      `[CONFIG-DESARROLLO] ${variable} no esta definido; se usa un valor de ` +
        `DESARROLLO (${valorDesarrollo}) para ${paraQue}. ` +
        `Definirlo antes de pasar a produccion.`
    );
  }

  return valorDesarrollo;
}

/**
 * Igual que datoObligatorio, pero devuelve undefined si falta.
 *
 * Para datos genuinamente opcionales, donde "no informado" es una
 * respuesta valida. Lo que no se acepta es inventar el contenido.
 */
export function datoOpcional(variable: string): string | undefined {
  const valor = (process.env[variable] ?? '').trim();
  return valor || undefined;
}

/**
 * Falla al arrancar si falta algo basico para operar en produccion.
 *
 * Se llama desde index.ts ANTES de levantar el servidor, para que un
 * .env incompleto se note al reiniciar y no a mitad de una venta.
 */
export function validarArranque(): void {
  if (!esProduccion()) {
    console.log('[CONFIG] Modo desarrollo: se permiten valores de prueba.');
    return;
  }

  const obligatorias: Array<[string, string]> = [
    ['DATABASE_URL', 'conectarse a PostgreSQL'],
    ['JWT_SECRET', 'firmar las sesiones de cliente'],
    ['WEBPAY_COMMERCE_CODE', 'operar la pasarela de pago'],
    ['WEBPAY_API_KEY_SECRET', 'operar la pasarela de pago'],
    ['WEBPAY_RETURN_URL', 'devolver al cliente despues de pagar'],
    ['FRONTEND_URL', 'los enlaces de los correos al cliente'],
    ['CORS_ORIGIN', 'que el navegador pueda llamar a la API'],
    ['SMTP_HOST', 'enviar los correos transaccionales'],
    ['SMTP_USER', 'enviar los correos transaccionales'],
    ['SMTP_PASS', 'enviar los correos transaccionales'],
    ['EMAIL_FROM', 'los correos transaccionales'],
    ['FACTO_CLIENT_ID', 'emitir facturas ante el SII'],
    ['FACTO_CLIENT_SECRET', 'emitir facturas ante el SII'],
    ['FACTO_USERNAME', 'emitir facturas ante el SII'],
    ['FACTO_PASSWORD', 'emitir facturas ante el SII'],
    ['FACTO_ACCOUNT_ID', 'emitir facturas en la cuenta correcta'],
    ['FACTO_EMISOR_RUT', 'identificar al emisor en cada factura'],
    ['FACTO_EMISOR_RAZON_SOCIAL', 'identificar al emisor en cada factura'],
    ['FACTO_EMISOR_GIRO', 'identificar al emisor en cada factura'],
    ['FACTO_EMISOR_DIRECCION', 'identificar al emisor en cada factura']
  ];

  const faltantes = obligatorias
    .filter(([variable]) => !(process.env[variable] ?? '').trim())
    .map(([variable]) => variable);

  if (faltantes.length > 0) {
    throw new Error(
      `CONFIGURACION_FALTANTE: no se puede arrancar en produccion. ` +
        `Faltan ${faltantes.length} variable(s) en el .env del servidor:\n` +
        faltantes.map((v) => `  - ${v}`).join('\n') +
        `\n\nRevisar el .env.example, que documenta cada una.`
    );
  }

  // Aviso adicional: se podria estar emitiendo DTE en sandbox desde
  // produccion, lo que deja al cliente sin factura válida.
  if ((process.env.FACTO_SANDBOX ?? '').toLowerCase() === 'true') {
    throw new Error(
      `CONFIGURACION_INVALIDA: FACTO_SANDBOX=true con NODE_ENV=production. ` +
        `Se emitirían facturas de prueba que el SII no reconoce. ` +
        `Poner FACTO_SANDBOX=false y usar las credenciales productivas.`
    );
  }
}