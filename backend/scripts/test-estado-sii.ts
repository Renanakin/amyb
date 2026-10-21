/**
 * Pruebas de interpretacion del estado del SII.
 *
 * El riesgo que cubren: FACTO responde "enviado, en proceso" y el SII
 * contesta DESPUES. Si se confunde "en proceso" con "aprobado", el sistema
 * muestra como valida una factura que el SII rechazo, y el cliente se la
 * lleva sin poder usarla en su contabilidad.
 *
 * No necesita base de datos ni backend: es logica pura.
 *
 * Ejecutar: npx tsx scripts/test-estado-sii.ts
 */
import { clasificarEstadoSii } from '../src/facto/estadoSii.js';

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

console.log('\n=== ESTADO DE LAS FACTURAS EN EL SII ===\n');

// -------------------------------------------------------------------
console.log('[1] Documento aprobado');
// -------------------------------------------------------------------
const aprobado = clasificarEstadoSii({
  taxbureau_send_status: 1,
  taxbureau_validation_status: 3
});
check('queda como aprobado', aprobado.estado === 'aprobado', `(estado: ${aprobado.estado})`);
check('no requiere intervencion', aprobado.accionable === false);

// -------------------------------------------------------------------
console.log('\n[2] Documento RECHAZADO por el SII');
// -------------------------------------------------------------------
// El caso que motiva todo esto: envio OK (status 1) pero el SII despues
// lo rechaza (validation 5). Si se mirara solo el envio, diria que todo
// esta bien.
const rechazado = clasificarEstadoSii({
  taxbureau_send_status: 1,
  taxbureau_validation_status: 5
});
check('detecta el rechazo pese a que el envio fue correcto', rechazado.estado === 'rechazado', `(estado: ${rechazado.estado})`);
check('lo marca como accionable', rechazado.accionable === true);
check('la etiqueta dice que NO es valida', /NO es valida/.test(rechazado.etiqueta), `(etiqueta: ${rechazado.etiqueta})`);
check('indica que hay que reemitir', /[Rr]eemitir/.test(rechazado.accion), `(accion: ${rechazado.accion})`);
check('no es transitorio: esperar no arregla nada', rechazado.transitorio === false);

// -------------------------------------------------------------------
console.log('\n[3] Aprobado con observaciones');
// -------------------------------------------------------------------
const observado = clasificarEstadoSii({
  taxbureau_send_status: 1,
  taxbureau_validation_status: 4
});
check('lo distingue de aprobado', observado.estado === 'observado', `(estado: ${observado.estado})`);
check('no exige reemitir', observado.accionable === false);

// -------------------------------------------------------------------
console.log('\n[4] Error temporal de envio (FACTO reintenta solo)');
// -------------------------------------------------------------------
const temporal = clasificarEstadoSii({
  taxbureau_send_status: 105,
  taxbureau_validation_status: 0
});
check('lo clasifica como reintentando', temporal.estado === 'reintentando', `(estado: ${temporal.estado})`);
check('no exige intervencion: FACTO ya esta reintentando', temporal.accionable === false);
check('es transitorio', temporal.transitorio === true);

// -------------------------------------------------------------------
console.log('\n[5] Error permanente de envio (FACTO no reintenta)');
// -------------------------------------------------------------------
const permanente = clasificarEstadoSii({
  taxbureau_send_status: 202,
  taxbureau_validation_status: 0
});
check('lo clasifica como error permanente', permanente.estado === 'error_permanente', `(estado: ${permanente.estado})`);
check('exige intervencion', permanente.accionable === true);
check('dice que nunca se resuelve solo', /nunca se resuelve solo/.test(permanente.accion), `(accion: ${permanente.accion})`);

// -------------------------------------------------------------------
console.log('\n[6] Documento recien enviado, sin respuesta del SII aun');
// -------------------------------------------------------------------
const procesando = clasificarEstadoSii({
  taxbureau_send_status: 1,
  taxbureau_validation_status: 0
});
check('queda en proceso, NO como aprobado', procesando.estado === 'procesando', `(estado: ${procesando.estado})`);
check('no se marca como valido todavia', procesando.accionable === false);

// -------------------------------------------------------------------
console.log('\n[7] Respuestas inutiles: no se inventa un estado optimista');
// -------------------------------------------------------------------
for (const [nombre, respuesta] of [
  ['null', null],
  ['objeto vacio', {}],
  ['sin campos', { hola: 'mundo' }],
  ['con error', { error: 'timeout' }]
] as Array<[string, any]>) {
  const v = clasificarEstadoSii(respuesta);
  check(
    `respuesta inutil (${nombre}) no se marca como aprobado`,
    v.estado !== 'aprobado' && v.estado !== 'observado',
    `(estado: ${v.estado})`
  );
  check(
    `respuesta inutil (${nombre}) queda como desconocido`,
    v.estado === 'desconocido',
    `(estado: ${v.estado})`
  );
}

// -------------------------------------------------------------------
console.log('\n[8] Un codigo de estado desconocido no se APPROBARA por omision');
// -------------------------------------------------------------------
const raro = clasificarEstadoSii({
  taxbureau_send_status: 77,
  taxbureau_validation_status: 9
});
check('no lo confunde con aprobado', raro.estado !== 'aprobado', `(estado: ${raro.estado})`);
check('queda como desconocido y avisa', raro.estado === 'desconocido', `(estado: ${raro.estado})`);
check('pide revision manual', raro.accionable === true);

// -------------------------------------------------------------------
console.log('\n[9] Documento simulado no se confunde con uno validado');
// -------------------------------------------------------------------
const simulado = clasificarEstadoSii({
  isSandbox: true,
  taxbureau_send_status: 1,
  taxbureau_validation_status: 3
});
check('no dice que el SII lo aprobo como real', /simulado/i.test(simulado.etiqueta), `(etiqueta: ${simulado.etiqueta})`);

console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);

if (fail > 0) {
  throw new Error(`${fail} prueba(s) de estado del SII fallaron.`);
}