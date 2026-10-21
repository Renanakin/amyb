/**
 * Genera y verifica RUT chilenos validos.
 *
 * No sirve con inventar el digito verificador: un RUT con el DV
 * erroneo hace que el checkout rechace la factura y el cliente ve
 * "El RUT de la Empresa ingresado no es valido". Este script genera
 * RUT que el backend acepta de verdad.
 *
 * Ejecutar: npx tsx scripts/ruts-de-prueba.ts
 */
import { DteValidatorService } from '../src/services/dteValidator.js';

/** Calcula el digito verificador de un cuerpo de RUT (Modulo 11). */
function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const d = 11 - (suma % 11);
  return d === 11 ? '0' : d === 10 ? 'K' : String(d);
}

function formatear(cuerpo: string, dv: string): string {
  // El cuerpo se rellena a 8 digitos solo para presentarlo con ceros
  // a la izquierda. El digito verificador se calcula sobre el cuerpo
  // original, que es el que realmente valida el backend.
  const c = cuerpo.padStart(8, '0');
  // Formato chileno: los puntos separan cada 3 digitos desde la derecha.
  const partes: string[] = [];
  let resto = c;
  while (resto.length > 3) {
    partes.unshift(resto.slice(-3));
    resto = resto.slice(0, -3);
  }
  partes.unshift(resto);
  return `${partes.join('.')}-${dv}`;
}

console.log('\n=== RUT CHILENOS VERIFICADOS PARA FACTURACION ===\n');
console.log('Todos los de esta lista fueron validados con el mismo algoritmo');
console.log('que usa el backend al crear el pedido (Modulo 11).');
console.log('Se pueden usar tal cual en el checkout.\n');

const cuerpos = [
  '76543210',
  '76543218',
  '12345678',
  '11111111',
  '98765432',
  '12345678'
];

const vistos = new Set<string>();
console.log('RUT valido         | Que serviria para');
console.log('-------------------|---------------------------------------------');

for (const cuerpo of cuerpos) {
  const dv = digitoVerificador(cuerpo);
  const rut = formatear(cuerpo, dv);
  if (vistos.has(rut)) continue;
  vistos.add(rut);

  // Se valida con el MISMO servicio que usa el backend
  const ok = DteValidatorService.validateRut(rut);
  if (!ok) continue;

  console.log(`${rut.padEnd(19)} | Empresa, RUT generico de demostracion`);
}

console.log('\n--- RUT MAS SEGUROS PARA LA DEMOSTRACION ---\n');
console.log('Estos son los que conviene usar: se ven realistas y son validos.\n');

// Genera una tanda de RUT plausibles y verifica cada uno
const ejemplos = [
  { cuerpo: '76543210', etiqueta: 'Sushi Bar (la que usamos en la prueba del ciclo)' },
  { cuerpo: '77452180', etiqueta: 'Restaurante generico' },
  { cuerpo: '96824570', etiqueta: 'Distribuidora / Giro comercial' },
  { cuerpo: '15234567', etiqueta: 'Persona natural con actividad_empresa' }
];

for (const e of ejemplos) {
  const dv = digitoVerificador(e.cuerpo);
  const rut = formatear(e.cuerpo, dv);
  const valido = DteValidatorService.validateRut(rut);
  const marca = valido ? 'OK  ' : 'FALLA';
  console.log(`  [${marca}] ${rut}   ${e.etiqueta}`);
}

console.log('\n--- COMO USARLOS EN EL CHECKOUT ---\n');
console.log('  Tipo de documento:  Factura Electronica');
console.log('  RUT Empresa:        (copiar de la lista de arriba)');
console.log('  Razon Social:       (cualquier nombre de empresa)');
console.log('  Giro Comercial:     (cualquier giro, ej. "Restaurante")');
console.log('  Direccion Tax:      (cualquier direccion)');
console.log('  Comuna:             Temuco\n');

console.log('--- SI RECHAZA EL RUT ---\n');
console.log('  1. Verificar que tenga el digito verificador (el ultimo numero o K)');
console.log('  2. El backend lo compara con Modulo 11; no basta con que "parezca" RUT');
console.log('  3. Generar uno nuevo:  npx tsx scripts/ruts-de-prueba.ts\n');

console.log('=== RUT DEL BANCO DE PRUEBAS DE TRANSBANK ===\n');
const bancoRut = '11111111';
const bancoDv = digitoVerificador(bancoRut);
console.log(`  RUT:  11.111.111-${bancoDv}   (solo para la pasarela de Transbank)`);
console.log(`  Clave: 123`);
console.log(`  Este NO es un RUT de empresa: es el del tarjetahabiente simulado.\n`);
