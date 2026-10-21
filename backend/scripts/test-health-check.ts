/**
 * Pruebas del health check.
 *
 * El fallo que cubren: /api/health respondia 200 SIEMPRE, sin tocar la
 * base. Monitoring y balanceadores recibian "todo bien" con PostgreSQL
 * caido, que es exactamente cuando la tienda NO puede vender. Durante el
 * desarrollo de este modulo, el propio backend se reporto sano con la
 * base apagada y eso costo tiempo.
 *
 * Logica pura con una sonda inyectada: no necesita base ni servidor.
 *
 * Ejecutar: npx tsx scripts/test-health-check.ts
 */
import { evaluarSalud } from '../src/salud.js';

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

/** Restaura las variables que la evaluacion modifica al avisar. */
function guardarEnv() {
  return { SMTP_HOST: process.env.SMTP_HOST, FACTO_CLIENT_ID: process.env.FACTO_CLIENT_ID, WEBPAY_COMMERCE_CODE: process.env.WEBPAY_COMMERCE_CODE };
}

async function main() {
console.log('\n=== HEALTH CHECK ===\n');

// -------------------------------------------------------------------
console.log('[1] La base responde');
// -------------------------------------------------------------------
const bien = await evaluarSalud(async () => [{ '1': 1 }]);
check('el servicio se declara sano', bien.ok === true, `(estado: ${bien.estado})`);
check('dice que la base esta ok', bien.checks.baseDatos === 'ok');
check('informa la latencia de la consulta', typeof bien.checks.latenciaBaseDatosMs === 'number');

// -------------------------------------------------------------------
console.log('\n[2] La base esta CAIDA');
// -------------------------------------------------------------------
// Este es el caso que antes pasaba desapercibido.
try {
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.FACTO_CLIENT_ID = 'id';
  process.env.WEBPAY_COMMERCE_CODE = 'code';
} catch { /* solo afecta los avisos */ }

const caida = await evaluarSalud(async () => {
  throw new Error("Can't reach database server at localhost:5432");
});
check('NO se declara sano', caida.ok === false, `(ok: ${caida.ok})`);
check('queda como degraded', caida.estado === 'degraded', `(estado: ${caida.estado})`);
check('marca la base como error', caida.checks.baseDatos === 'error');
check(
  'avisa que la tienda no puede atender',
  caida.avisos.some((a) => /no puede atender/.test(a)),
  `(avisos: ${caida.avisos.join(' | ')})`
);

// -------------------------------------------------------------------
console.log('\n[3] La base se CUELGA (no responde)');
// -------------------------------------------------------------------
// Una consulta que se queda colgada es tan inÃºtil como una que falla: el
// health check no puede quedarse esperando indefinidamente.
const colgada = await evaluarSalud(
  () => new Promise<never>(() => { /* nunca resuelve */ }),
  200
);
check('NO se declara sano ante una base colgada', colgada.ok === false, `(ok: ${colgada.ok})`);
check('lo distingue de un error de conexion', colgada.checks.baseDatos === 'timeout', `(estado: ${colgada.checks.baseDatos})`);
check('no cuelga el health check', true);

// -------------------------------------------------------------------
console.log('\n[4] Avisos de configuracion sin frenar el servicio');
// -------------------------------------------------------------------
// Que falte SMTP no significa que la tienda no pueda vender, asi que se
// avisa pero NO se marca como caido. La base si es bloqueante.
const original = guardarEnv();
try {
  delete process.env.SMTP_HOST;
  delete process.env.FACTO_CLIENT_ID;
  delete process.env.WEBPAY_COMMERCE_CODE;

  const sinConfig = await evaluarSalud(async () => [{ '1': 1 }]);
  check('con la base sana sigue declarado sano', sinConfig.ok === true);
  check(
    'avisa que falta SMTP',
    sinConfig.avisos.some((a) => /SMTP/.test(a)),
    `(avisos: ${sinConfig.avisos.join(' | ')})`
  );
  check(
    'avisa que falta FACTO',
    sinConfig.avisos.some((a) => /FACTO/.test(a)),
    `(avisos: ${sinConfig.avisos.join(' | ')})`
  );
  check(
    'avisa que falta Transbank',
    sinConfig.avisos.some((a) => /Transbank/.test(a)),
    `(avisos: ${sinConfig.avisos.join(' | ')})`
  );
} finally {
  if (original.SMTP_HOST !== undefined) process.env.SMTP_HOST = original.SMTP_HOST;
  if (original.FACTO_CLIENT_ID !== undefined) process.env.FACTO_CLIENT_ID = original.FACTO_CLIENT_ID;
  if (original.WEBPAY_COMMERCE_CODE !== undefined) process.env.WEBPAY_COMMERCE_CODE = original.WEBPAY_COMMERCE_CODE;
}

// -------------------------------------------------------------------
console.log('\n[5] Con todo bien no hay avisos que actionar');
// -------------------------------------------------------------------
try {
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.FACTO_CLIENT_ID = 'id';
  process.env.WEBPAY_COMMERCE_CODE = 'code';

  const limpio = await evaluarSalud(async () => [{ '1': 1 }]);
  check('sin avisos', limpio.avisos.length === 0, `(avisos: ${limpio.avisos.join(' | ')})`);
} finally {
  if (original.SMTP_HOST !== undefined) process.env.SMTP_HOST = original.SMTP_HOST;
  else delete process.env.SMTP_HOST;
  if (original.FACTO_CLIENT_ID !== undefined) process.env.FACTO_CLIENT_ID = original.FACTO_CLIENT_ID;
  else delete process.env.FACTO_CLIENT_ID;
  if (original.WEBPAY_COMMERCE_CODE !== undefined) process.env.WEBPAY_COMMERCE_CODE = original.WEBPAY_COMMERCE_CODE;
  else delete process.env.WEBPAY_COMMERCE_CODE;
}

  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);

  if (fail > 0) {
    throw new Error(`${fail} prueba(s) del health check fallaron.`);
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
});