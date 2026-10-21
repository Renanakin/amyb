/**
 * Cola de notas de credito pendientes.
 *
 * Una venta facturada no se anula devolviendo la plata: la factura queda
 * en el libro del SII para siempre y hay que emitir una Nota de Credito
 * (tipo 61) que la reference. El endpoint /api/webpay/refund bloquea esa
 * anulacion a proposito, asi que este script es la vista de trabajo para
 * resolver esas ventas.
 *
 * Lista los pedidos que tienen factura emitida y NO tienen nota de
 * credito registrada. Solo lectura: no emite ni modifica nada.
 *
 * Ejecutar:  npx tsx scripts/notas-credito-revisar.ts
 */
import { prisma } from '../src/lib/prisma.js';

async function run() {
  const pendientes = await prisma.order.findMany({
    where: {
      dteDocumentId: { not: null },
      dteAnulacionFolio: null,
      paymentStatus: { in: ['pagado', 'rechazado', 'reembolso_pendiente'] }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\n=== NOTAS DE CREDITO PENDIENTES: ${pendientes.length} ===\n`);

  if (pendientes.length === 0) {
    console.log(
      '  Ninguna. Toda venta facturada que quedo anulada tiene su nota.\n'
    );
    return;
  }

  console.log(
    '  Para cada una: emitir en FACTO una Nota de Credito (tipo 61) que\n' +
      '  referencie el folio original, con motivo "anulacion de venta".\n' +
      '  FACTO la emite gratis para documentos ya enviados al SII.\n'
  );

  for (const o of pendientes) {
    const dias = Math.floor((Date.now() - o.createdAt.getTime()) / 86400000);
    console.log(
      `  ${o.orderNumber}  folio ${o.dteFolio}  ${o.dteTipoDocumento?.toUpperCase() ?? 'DTE'}  $${o.total.toLocaleString('es-CL')}`
    );
    console.log(`     cliente: ${o.customerNombre} (${o.customerEmail})`);
    console.log(
      `     pedido ${o.paymentStatus} / ${o.orderStatus}  -  hace ${dias} dia(s)`
    );
    console.log(`     motivo anulacion registrado: ${o.dteAnulacionMotivo ?? '(ninguno)'}`);
    console.log(`     pdf: ${o.dtePdfUrl ?? '(sin pdf)'}\n`);
  }

  console.log(
    '  Cuando emitas la nota, registra el folio con:\n' +
      '    UPDATE orders SET dte_anulacion_folio = <folio NC>,\n' +
      '                       dte_anulacion_tipo = \'61\',\n' +
      '                       dte_anulacion_motivo = \'anulacion de venta\'\n' +
      '    WHERE order_number = <pedido>;\n'
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