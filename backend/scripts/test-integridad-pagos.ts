/**
 * Pruebas de integridad de la facturacion (DTE).
 *
 * Estas pruebas NO necesitan base de datos ni el servidor de pagos: levantan
 * un FACTO falso en un puerto local para simular lo que hace el SII y
 * verificar que el sistema NUNCA inventa un folio.
 *
 * Ejecutar: npx tsx scripts/test-integridad-pagos.ts
 *
 * El riesgo que cubren: un folio inventado es una factura que el SII nunca
 * autorizo, guardada como pagada y con PDF descargable para el cliente. En
 * desarrollo el DTE simulado es util; en produccion es un problema contable
 * y legal, asi que ahi debe fallar de forma visible.
 */
import http from 'node:http';

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, extra = '') {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} ${extra}`);
  }
}

// ---------------------------------------------------------------------
// FACTO Chile falso: permite cambiar de comportamiento en caliente.
// ---------------------------------------------------------------------
type Modo = 'con-folio' | 'sin-folio' | 'error-500';
let modo: Modo = 'con-folio';
let puerto = 0;

const servidor = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/v1/auth') {
    res.statusCode = 200;
    res.end(
      JSON.stringify({ data: { access_token: 'token-de-prueba', expires_in: 3600 } })
    );
    return;
  }

  if (req.url === '/v1/documents') {
    if (modo === 'error-500') {
      res.statusCode = 500;
      res.end(JSON.stringify({ message: 'SII no disponible' }));
      return;
    }
    if (modo === 'sin-folio') {
      // Respuesta 200 "exitosa" pero sin folio: el caso donde antes se
      // inventaba un numero al azar.
      res.statusCode = 200;
      res.end(JSON.stringify({ data: { document_id: 555 } }));
      return;
    }
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        data: {
          document_id: 777,
          folio: 12345,
          header: { document_status: 1 }
        }
      })
    );
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ message: 'ruta no encontrada' }));
});

const PARAMS = {
  orderId: 'AMYB-TEST-1',
  documentType: 'boleta' as const,
  customer: {
    nombre: 'Cliente de Prueba SpA',
    email: 'prueba@amyb.cl',
    telefono: '+56912345678',
    rutEmpresa: '77.987.654-3',
    razonSocial: 'Cliente de Prueba SpA',
    giroComercial: 'Restaurante',
    direccionTributaria: 'Av. Alemania 0450',
    comunaTributaria: 'Temuco'
  },
  items: [{ name: 'Queso Crema', quantity: 2, price: 9490 }],
  subtotal: 15966,
  iva: 3034,
  total: 19000
};

// Guardamos el entorno original para no dejar el .env del desarrollador
// modificado al terminar la prueba.
const envOriginal = { ...process.env };

function limpiarCredenciales() {
  delete process.env.FACTO_CLIENT_ID;
  delete process.env.FACTO_CLIENT_SECRET;
  delete process.env.FACTO_USERNAME;
  delete process.env.FACTO_PASSWORD;
}

function ponerCredenciales() {
  process.env.FACTO_CLIENT_ID = 'id-de-prueba';
  process.env.FACTO_CLIENT_SECRET = 'secret-de-prueba';
  process.env.FACTO_USERNAME = 'usuario';
  process.env.FACTO_PASSWORD = 'password';
}

/**
 * Identidad legal del emisor.
 *
 * En un servidor real estos valores SIEMPRE estan: son los de Amyb. En
 * produccion, si faltan, el sistema tiene que fallar en vez de emitir
 * una factura con datos inventados.
 */
function ponerDatosEmisor() {
  process.env.FACTO_ACCOUNT_ID = '9999';
  process.env.FACTO_EMISOR_RUT = '77.358.899-6';
  process.env.FACTO_EMISOR_RAZON_SOCIAL = 'Amyb Distribuidora Gastronomica SpA';
  process.env.FACTO_EMISOR_GIRO = 'Distribucion mayorista HORECA';
  process.env.FACTO_EMISOR_DIRECCION = 'Av. Alemania 0890, Temuco';
}

function limpiarDatosEmisor() {
  delete process.env.FACTO_ACCOUNT_ID;
  delete process.env.FACTO_EMISOR_RUT;
  delete process.env.FACTO_EMISOR_RAZON_SOCIAL;
  delete process.env.FACTO_EMISOR_GIRO;
  delete process.env.FACTO_EMISOR_DIRECCION;
}

async function run() {
  await new Promise<void>((resolve) =>
    servidor.listen(0, '127.0.0.1', () => {
      puerto = (servidor.address() as any).port;
      resolve();
    })
  );

  // Las clases de FACTO leen FACTO_BASE_URL una sola vez al cargarse, asi
  // que hay que fijarla ANTES del import dinamico.
  process.env.FACTO_BASE_URL = `http://127.0.0.1:${puerto}/v1`;

  const { FactoService } = await import('../src/services/factoService.js');
  const { FactoAuthService } = await import('../src/facto/factoAuth.js');

  console.log('\n=== INTEGRIDAD DE LA FACTURACION (DTE) ===\n');

  // -------------------------------------------------------------------
  console.log('[1] Produccion sin credenciales de FACTO');
  // -------------------------------------------------------------------
  process.env.NODE_ENV = 'production';
  limpiarCredenciales();
  ponerDatosEmisor();
  FactoAuthService.clearCache();
  modo = 'con-folio';

  let fallo: string | null = null;
  try {
    await FactoService.emitDte(PARAMS);
  } catch (e: any) {
    fallo = e.message;
  }
  check(
    'lanza error en vez de emitir un DTE simulado',
    fallo !== null,
    `(no lanzo: ${fallo})`
  );
  check(
    'el error identifica credenciales faltantes en produccion',
    (fallo ?? '').includes('FACTO_CHILE_SIN_CREDENCIALES'),
    `(mensaje: ${fallo})`
  );

  // -------------------------------------------------------------------
  console.log('\n[1b] Produccion sin la identidad legal del emisor');
  // -------------------------------------------------------------------
  limpiarDatosEmisor();

  let falloEmisor: string | null = null;
  try {
    await FactoService.emitDte(PARAMS);
  } catch (e: any) {
    falloEmisor = e.message;
  }
  check(
    'no emite el documento con datos del emisor inventados',
    falloEmisor !== null,
    `(no lanzo)`
  );
  check(
    'el error dice que variable falta y por que se necesita',
    (falloEmisor ?? '').includes('CONFIGURACION_FALTANTE') &&
      /falta FACTO_[A-Z_]+/.test(falloEmisor ?? '') &&
      /no sigue con valores por defecto/.test(falloEmisor ?? ''),
    `(mensaje: ${falloEmisor})`
  );

  ponerDatosEmisor();

  // -------------------------------------------------------------------
  console.log('\n[2] Produccion con credenciales y SII caido (HTTP 500)');
  // -------------------------------------------------------------------
  ponerCredenciales();
  FactoAuthService.clearCache();
  modo = 'error-500';

  let resultado500: any = null;
  let error500: string | null = null;
  try {
    resultado500 = await FactoService.emitDte(PARAMS);
  } catch (e: any) {
    error500 = e.message;
  }
  check(
    'no devuelve un DTE simulado cuando el SII falla',
    resultado500 === null,
    `(devolvio folio ${resultado500?.folio})`
  );
  check('el error sube para que el pedido quede pendiente', error500 !== null);

  // -------------------------------------------------------------------
  console.log('\n[3] Produccion con respuesta 200 pero sin folio');
  // -------------------------------------------------------------------
  modo = 'sin-folio';

  let resultadoSinFolio: any = null;
  let errorSinFolio: string | null = null;
  try {
    resultadoSinFolio = await FactoService.emitDte(PARAMS);
  } catch (e: any) {
    errorSinFolio = e.message;
  }
  check(
    'NO inventa un folio cuando la API no lo entrega',
    resultadoSinFolio === null,
    `(invento folio ${resultadoSinFolio?.folio})`
  );
  check(
    'el error identifica la respuesta sin folio',
    (errorSinFolio ?? '').includes('FACTO_CHILE_RESPUESTA_SIN_FOLIO'),
    `(mensaje: ${errorSinFolio})`
  );

  // -------------------------------------------------------------------
  console.log('\n[4] Produccion con la API funcionando (camino feliz)');
  // -------------------------------------------------------------------
  modo = 'con-folio';

  const ok = await FactoService.emitDte(PARAMS);
  check('devuelve el folio REAL de la API (12345)', ok.folio === 12345, `(folio: ${ok.folio})`);
  check('devuelve el document_id real (777)', ok.documentId === 777, `(id: ${ok.documentId})`);
  check('no se marca como sandbox', ok.isSandbox === false);

  // -------------------------------------------------------------------
  console.log('\n[5] Desarrollo conserva el modo simulado (util para trabajar)');
  // -------------------------------------------------------------------
  process.env.NODE_ENV = 'development';
  limpiarCredenciales();
  FactoAuthService.clearCache();

  const dev = await FactoService.emitDte(PARAMS);
  check('sigue emitiendo un DTE simulado en desarrollo', dev.success === true);
  check('se marca como sandbox', dev.isSandbox === true);
  check(
    'la etiqueta dice explicitamente que NO es valido ante el SII',
    /NO es valido ante el SII/.test(dev.statusLabel),
    `(etiqueta: ${dev.statusLabel})`
  );
  check(
    'no afirma que el SII lo aprobo',
    !/Autorizado por SII/.test(dev.statusLabel),
    `(etiqueta: ${dev.statusLabel})`
  );

  // -------------------------------------------------------------------
  console.log('\n[6] Desarrollo con el SII caido: contingencia, no perdida');
  // -------------------------------------------------------------------
  ponerCredenciales();
  FactoAuthService.clearCache();
  modo = 'error-500';

  const devCaido = await FactoService.emitDte(PARAMS);
  check('no se pierde la compra en desarrollo', devCaido.success === true);
  check(
    'la contingencia tambien dice que NO es valido ante el SII',
    /NO es valido ante el SII/.test(devCaido.statusLabel),
    `(etiqueta: ${devCaido.statusLabel})`
  );

  // -------------------------------------------------------------------
  console.log('\n[7] Consulta de estado no afirma aprobacion sin credenciales');
  // -------------------------------------------------------------------
  process.env.NODE_ENV = 'production';
  limpiarCredenciales();
  modo = 'con-folio';

  const estadoProd = await FactoService.getDocumentStatus(12345);
  check(
    'en produccion dice "estado desconocido" en vez de "aprobado"',
    /estado desconocido/.test(estadoProd.statusDescription ?? ''),
    `(respuesta: ${estadoProd.statusDescription})`
  );
  check(
    'no afirma que el SII aprobo el documento',
    !/Aprobado por el SII/.test(estadoProd.statusDescription ?? ''),
    `(respuesta: ${estadoProd.statusDescription})`
  );

  process.env.NODE_ENV = 'development';
  FactoAuthService.clearCache();
  const estadoDev = await FactoService.getDocumentStatus(12345);
  check(
    'en desarrollo el mock de estado sigue funcionando',
    /Simulaci/.test(estadoDev.statusDescription ?? ''),
    `(respuesta: ${estadoDev.statusDescription})`
  );

  // -------------------------------------------------------------------
  console.log('\n[8] Factura sin RUT del receptor');
  // -------------------------------------------------------------------
  // Una factura sin RUT del comprador no le sirve a nadie: es un
  // documento inservible. Antes el sistema completaba el RUT con uno
  // inventado y emitia la factura igual.
  const facturaSinRut = {
    ...PARAMS,
    documentType: 'factura' as const,
    customer: { ...PARAMS.customer, rutEmpresa: undefined }
  };

  let facturaErr: string | null = null;
  try {
    await FactoService.emitDte(facturaSinRut);
  } catch (e: any) {
    facturaErr = e.message;
  }
  check(
    'NO emite la factura con un RUT inventado',
    facturaErr !== null,
    `(emitio la factura sin RUT)`
  );
  check(
    'el error explica que hay que pedir el RUT al cliente',
    (facturaErr ?? '').includes('FACTO_CHILE_RUT_RECEPTOR_FALTANTE'),
    `(mensaje: ${facturaErr})`
  );
  check(
    'el error aclara que la Boleta si se puede emitir',
    (facturaErr ?? '').includes('Boletas no necesitan RUT'),
    `(mensaje: ${facturaErr})`
  );

  // Con RUT, la factura debe salir normalmente.
  FactoAuthService.clearCache();
  modo = 'con-folio';
  const facturaConRut = await FactoService.emitDte({
    ...PARAMS,
    documentType: 'factura' as const
  });
  check(
    'con RUT informado la factura si se emite',
    facturaConRut.success === true && facturaConRut.siiCode === '33',
    `(siiCode: ${facturaConRut.siiCode})`
  );

  // -------------------------------------------------------------------
  console.log(
    `\n=== RESUMEN: ${pass} PASS / ${fail} FAIL ===\n`
  );

  if (fail > 0) {
    throw new Error(`${fail} prueba(s) de integridad tributaria fallaron.`);
  }
}

run()
  .catch((e) => {
    console.error('\nERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Restaurar el entorno del desarrollador.
    process.env = envOriginal;
    servidor.close();
  });
