/**
 * Reintento de emision de DTE para pedidos PAGADOS que se quedaron sin
 * documento.
 *
 * Cuando el SII o FACTO no responden en el momento del pago, el pedido
 * queda pagado pero sin factura. Perder la venta es peor que perder el
 * documento, asi que el backend lo deja marcado y este script emite la
 * factura mas tarde usando exactamente la misma logica del checkout
 * (nada de codigo duplicado que pueda divergir).
 *
 * Ejecutar: npx tsx scripts/reintentar-dte.ts
 * Ejecutar en seco (solo lista): npx tsx scripts/reintentar-dte.ts --dry-run
 */
import { prisma } from '../src/lib/prisma.js';
import { emitirDteParaPedido } from '../src/routes/webpay.js';

const dryRun = process.argv.includes('--dry-run');

async function run() {
  const sinDocumento = await prisma.order.findMany({
    where: {
      paymentStatus: 'pagado',
      // Dos situaciones distintas con la misma consecuencia: el pedido no
      // tiene una factura valida.
      //   1. nunca se emitio (el SII/FACTO estaba caido al pagar)
      //   2. se emitio pero el SII la RECHAZO. Ahí el documento no tiene
      //      folio valido, asi que hay que emitir uno nuevo, no reenviar
      //      el mismo (FACTO no reintenta los errores permanentes).
      OR: [
        { dteDocumentId: null },
        { dteEstadoSii: { in: ['rechazado', 'error_permanente'] } }
      ]
    },
    orderBy: { createdAt: 'asc' }
  });

  if (sinDocumento.length === 0) {
    console.log('Todos los pedidos pagados tienen documento valido.');
    return;
  }

  console.log(
    `\n=== ${sinDocumento.length} PEDIDO(S) PAGADO(S) SIN FACTURA VALIDA ===\n`
  );

  let emitidos = 0;
  let fallidos = 0;

  for (const order of sinDocumento) {
    const dias = Math.floor((Date.now() - order.createdAt.getTime()) / 86400000);
    const rechazado = order.dteDocumentId !== null;

    console.log(
      `  ${order.orderNumber}  $${order.total.toLocaleString('es-CL')}  ${order.customerNombre}  (hace ${dias} dia(s))`
    );
    console.log(
      rechazado
        ? `     el SII RECHAZO el documento ${order.dteFolio ?? ''} - hay que emitir uno nuevo`
        : `     nunca se emitio (estado: ${order.dteStatusLabel ?? 'sin etiqueta'})`
    );

    if (dryRun) {
      console.log('     [dry-run] no se emitio nada.\n');
      continue;
    }

    try {
      // Un documento rechazado no se puede reenviar: hay que emitir uno
      // nuevo. Se sueltan las referencias del anterior para que
      // emitirDteParaPedido no las vea como "ya emitido".
      if (rechazado) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            dteDocumentId: null,
            dteFolio: null,
            dtePdfUrl: null,
            dteXmlUrl: null
          }
        });
      }

      await emitirDteParaPedido(order.id);
      const emitido = await prisma.order.findUnique({
        where: { id: order.id },
        select: { dteFolio: true, dteStatusLabel: true }
      });
      emitidos++;
      console.log(`     [OK] emitido. Folio ${emitido?.dteFolio}\n`);
    } catch (e: any) {
      fallidos++;
      console.log(`     [!!] fallo: ${e.message}`);
      console.log(
        '         Si el SII rechazo por un dato malo (RUT, direccion), corregir\n' +
          '         el pedido ANTES de reintentar o se rechaza igual.\n'
      );
    }
  }

  console.log(`\n  Resumen: ${emitidos} emitido(s), ${fallidos} fallido(s).`);
  console.log(
    '  Despues de reemitir, correr: npm run dte:verificar\n'
  );
  if (fallidos > 0) process.exitCode = 1;
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
