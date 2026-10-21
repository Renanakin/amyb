/**
 * Verificacion del estado real de las facturas en el SII.
 *
 * FACTO responde "enviado, en proceso" y el SII contesta DESPUES. Un
 * documento puede quedar RECHAZADO horas despues de emitirlo, y como
 * nada consultaba ese estado en segundo plano, el rechazo era invisible:
 * el panel mostraba "procesado" y el cliente se llevaba una factura que el
 * SII no acepto.
 *
 * Este script barre los documentos emitidos, consulta su estado y deja el
 * veredicto en el pedido (dte_estado_sii), para que se pueda filtrar y
 * actuar.
 *
 * Ejecutar:              npx tsx scripts/dte-verificar.ts
 * Solo informar:         npx tsx scripts/dte-verificar.ts --dry-run
 * Revisar tambien los ya aprobados: npx tsx scripts/dte-verificar.ts --todos
 *
 * Recomendado: correr cada pocas horas. Los errores temporales (101-110)
 * los reintenta FACTO solo, asi que no hay que hacer nada con ellos.
 */
import { prisma } from '../src/lib/prisma.js';
import { FactoService } from '../src/services/factoService.js';
import { clasificarEstadoSii, type VeredictoSii } from '../src/facto/estadoSii.js';

const dryRun = process.argv.includes('--dry-run');
const todos = process.argv.includes('--todos');

async function run() {
  const pedidos = await prisma.order.findMany({
    where: {
      dteDocumentId: { not: null },
      // Sin --todos solo se revisan los que aun no tienen un veredicto
      // guardado: los ya aprobados no cambian y no vale la pena llamarlos.
      ...(todos ? {} : { dteEstadoSii: null })
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(
    `\n=== VERIFICACION DE FACTURAS EN EL SII${dryRun ? ' (EN SECO)' : ''} ===\n`
  );

  if (pedidos.length === 0) {
    console.log('  Ningun documento pendiente de verificar.\n');
    return;
  }

  console.log(`  Documentos a consultar: ${pedidos.length}\n`);

  const resumen: Record<string, number> = {};
  const accionables: Array<{ pedido: any; v: VeredictoSii }> = [];

  for (const pedido of pedidos) {
    const estado = await FactoService.getDocumentStatus(pedido.dteDocumentId!);

    // La simulacion local no tiene documento real en FACTO. Se marca como
    // tal para que no se cuente como una factura verificada.
    const respuesta = estado?.isSandbox
      ? { ...estado, isSandbox: true }
      : estado;

    const v = clasificarEstadoSii(respuesta);
    resumen[v.estado] = (resumen[v.estado] ?? 0) + 1;

    if (v.accionable) {
      accionables.push({ pedido, v });
    }

    if (!dryRun) {
      await prisma.order.update({
        where: { id: pedido.id },
        data: {
          dteEstadoSii: v.estado,
          dteEstadoSiiFecha: new Date(),
          dteStatusLabel: v.etiqueta
        }
      });
    }
  }

  console.log('  --- Resumen ---');
  for (const [estado, n] of Object.entries(resumen)) {
    console.log(`    ${estado.padEnd(18)} ${n}`);
  }

  if (accionables.length > 0) {
    console.log(`\n  --- Requieren intervencion: ${accionables.length} ---\n`);
    for (const { pedido, v } of accionables) {
      console.log(
        `  ${pedido.orderNumber}  folio ${pedido.dteFolio ?? '(sin folio)'}  ${v.estado}`
      );
      console.log(`     cliente: ${pedido.customerNombre} (${pedido.customerEmail})`);
      console.log(`     ${v.accion}\n`);
    }
  } else {
    console.log('\n  Ningun documento requiere intervencion.\n');
  }

  console.log(
    dryRun
      ? '  [dry-run] no se guardo ningun veredicto.\n'
      : '  Veredictos guardados en el pedido.\n'
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