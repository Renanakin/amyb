/**
 * Verificacion de la configuracion antes de desplegar.
 *
 * Corre exactamente las mismas reglas que ejecuta el servidor al
 * arrancar, sin levantarlo. Sirve para responder una pregunta concreta:
 * "¿con este .env el backend levanta en produccion o se cae?".
 *
 * Ejecutar con el .env real de destino:
 *   npx tsx scripts/verificar-config.ts
 *
 * Simular produccion con el .env de desarrollo (util para staging):
 *   npx tsx scripts/verificar-config.ts --simular-produccion
 */
import dotenv from 'dotenv';

// El .env tiene que cargarse antes de validar: sin esto el script
// reportaria como faltantes variables que si estan definidas.
// Debe ejecutarse desde la carpeta backend/, igual que el servidor.
dotenv.config();

import { validarArranque, esProduccion } from '../src/config.js';

const simular = process.argv.includes('--simular-produccion');

if (simular) {
  process.env.NODE_ENV = 'production';
}

console.log('\n=== VERIFICACION DE CONFIGURACION ===\n');
console.log(`  NODE_ENV:      ${process.env.NODE_ENV ?? '(sin definir)'}`);
console.log(`  Modo simulado: ${simular ? 'si, se simula produccion' : 'no'}`);
console.log(
  `  Base de datos: ${
    process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace(/:[^:@/]*@/, ':***@')
      : '(sin definir)'
  }\n`
);

try {
  validarArranque();

  console.log('  [OK] La configuracion permite arrancar.\n');

  if (simular) {
    console.log(
      '  Aviso: se verifico con las variables del .env actual. Si estas son\n' +
        '  las de desarrollo, las de produccion pueden ser distintas.\n'
    );
  }
} catch (error: any) {
  console.error(`  [FALLA] ${error.message}\n`);
  process.exitCode = 1;
}

// Resumen util: que valores estan llegando de valores por defecto.
if (!esProduccion()) {
  console.log(
    '  Modo desarrollo: se permiten valores de prueba, y cada uno avisa\n' +
      '  por consola con el prefijo [CONFIG-DESARROLLO]. Si aparece alguno,\n' +
      '  esa variable no esta definida.\n'
  );
}