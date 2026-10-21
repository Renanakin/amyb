/**
 * Cerrar pagos que el cliente abandono.
 *
 * El paso 0.1 del roadmap: 'procesando' era un estado sin salida. Cada
 * cliente que abria la pasarela y se arrepitia dejaba el pedido colgado
 * para siempre, y el panel lo mostraba igual que a un pago en curso.
 *
 * Ejecutar en seco (solo informa):  npx tsx scripts/pagos-expirar.ts
 * Ejecutar:                       npx tsx scripts/pagos-expirar.ts --si
 * Con otra ventana:               npx tsx scripts/pagos-expirar.ts --si --horas 4
 *
 * Recomendado: correr cada 15 o 30 minutos como tarea programada.
 */
import { prisma } from '../src/lib/prisma.js';
import {
  expirarPagosAbandonados,
  pagosColgados,
} from '../src/services/pagos.js';

const ejecutar = process.argv.includes('--si');
const argHoras = process.argv.indexOf('--horas');
const horas = argHoras > -1 ? Number(process.argv[argHoras + 1]) : 2;

async function run() {
  console.log(`\n=== PAGOS ABANDONADOS${ejecutar ? '' : ' (EN SECO)'} ===\n`);
  console.log(`  Ventana: ${horas} h sin actividad\n`);

  const antes = await pagosColgados(horas);
  console.log(`  Pagos colgados ahora: ${antes.length}`);

  const resultado = await expirarPagosAbandonados({
    horas,
    soloSimular: !ejecutar
  });

  console.log(`\n  Transacciones INITIATED revisadas: ${resultado.revisados}`);
  console.log(`  Cerradas por abandono:            ${resultado.expirados.length}`);
  console.log(`  Resultado de Transbank (Cobrados): ${resultado.cobradoSorpresivo.length}`);
  console.log(`  Sin poder verificar:               ${resultado.sinResolver.length}`);

  if (resultado.cobradoSorpresivo.length > 0) {
    console.log('\n  --- Se cobraron despues de la ventana: requieren reconciliar ---');
    for (const c of resultado.cobradoSorpresivo) {
      console.log(`  ${c.orderNumber}  token ${c.token ?? '-'}`);
    }
    console.log('  Correr: npm run pagos:reconciliar\n');
  }

  if (resultado.sinResolver.length > 0) {
    console.log('\n  --- No se pudieron verificar (NO se tocaron) ---');
    for (const s of resultado.sinResolver) {
      console.log(`  ${s.orderNumber}  ${s.motivo}`);
    }
    console.log(
      '\n  Se dejan como estan a proposito: sin Transbank no hay forma de\n' +
        '  saber si el cliente pago. Darlos por perdidos seria inventar.\n'
    );
  }

  if (resultado.expirados.length > 0) {
    console.log('\n  --- Cerrados ---');
    for (const e of resultado.expirados) {
      console.log(`  ${e.orderNumber}  token ${e.token ?? '-'}`);
    }
  }

  const despues = await pagosColgados(horas);
  console.log(
    `\n  Pagos colgados: ${antes.length} -> ${despues.length}` +
      `${ejecutar ? '' : ' (simulado: no se toco nada)'}`
  );
  console.log(
    despues.length > 0
      ? '\n  Para revisar manualmente: GET /api/admin/pagos/colgados\n'
      : ''
  );
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });