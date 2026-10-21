/**
 * Verifica el algoritmo de RUT chileno (Modulo 11) del backend.
 * Se usa para confirmar manualmente un RUT valido durante las pruebas
 * del flujo de pago, en vez de inventar uno al azar.
 */
import { DteValidatorService } from '../src/services/dteValidator.js';

console.log('=== VALIDACION DE RUT ===\n');

const casos: { rut: string; esperado: boolean; nota: string }[] = [
  { rut: '12.345.678-5', esperado: true, nota: 'RUT de ejemplo conocido' },
  { rut: '765432103', esperado: true, nota: 'cuerpo 76543210, DV 3' },
  { rut: '76.543.210-2', esperado: false, nota: 'DV erroneo' },
  { rut: '1-9', esperado: false, nota: 'muy corto' },
  { rut: '12.345.678-5', esperado: true, nota: 'debe seguir siendo valido' }
];

let pass = 0;
let fail = 0;

for (const c of casos) {
  const resultado = DteValidatorService.validateRut(c.rut);
  const ok = resultado === c.esperado;
  if (ok) pass++;
  else fail++;
  console.log(
    `  [${ok ? 'PASS' : 'FAIL'}] ${c.rut.padEnd(16)} -> ${resultado} (esperado ${c.esperado}) ${c.nota}`
  );
}

// Generar un RUT valido a partir de un cuerpo, para usar en pruebas
function generarRut(cuerpo: string): string {
  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const d = 11 - (suma % 11);
  const dv = d === 11 ? '0' : d === 10 ? 'K' : String(d);
  return cuerpo + dv;
}

console.log('\nRUTs generados para pruebas manuales:');
for (const cuerpo of ['76543210', '12345678', '11111111', '98765432']) {
  const r = generarRut(cuerpo);
  const valido = DteValidatorService.validateRut(r);
  console.log(`  ${r}  valido: ${valido ? 'SI' : 'NO'}`);
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
if (fail > 0) process.exitCode = 1;
