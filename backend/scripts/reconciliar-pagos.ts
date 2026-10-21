/**
 * Reconciliacion de pagos sin resolver.
 *
 * Resuelve las transacciones que quedaron en un estado intermedio y que
 * ningun flujo normal pudo cerrar. Son las que aparecen cuando la pasarela
 * falla a mitad de camino, justo cuando el sistema no puede saber la verdad.
 *
 *   Parte 1  Anulaciones pendientes (REFUND_PENDING)
 *            Transbank autorizo pero la confirmacion del pedido fallo y la
 *            anulacion automatica tampoco. Se reintenta sola.
 *
 *   Parte 2  Pagos sin confirmar (COMMITTED viejo)
 *            El commit se envio y no se supo que paso. Se consulta a
 *            Transbank para conocer el estado real.
 *
 * Ejecutar:  npx tsx scripts/reconciliar-pagos.ts
 * En seco:   npx tsx scripts/reconciliar-pagos.ts --dry-run
 *
 * URGENCIA en la parte 1: en tarjeta de debito Transbank solo permite anular
 * dentro del mismo dia habil de habilitacion de la operacion.
 *
 * La parte 2 NO decide sola si confirmar el pedido o devolver la plata: esa
 * es una decision comercial. Si el pago resulto AUTHORIZED pero el pedido
 * nunca se confirmo, el script lo reporta y lo deja a criterio de una
 * persona. Devolver la plata por el cuenta propia podria tirar una venta
 * que si se podia fulfillar.
 */
import { prisma } from '../src/lib/prisma.js';
import { WebpayPlusService } from '../src/services/webpayService.js';
import { anularPago } from '../src/routes/webpay.js';

const dryRun = process.argv.includes('--dry-run');

/** Minutos que se espera antes de dar por perdido un commit sin respuesta. */
const MINUTOS_ESPERA = Number(process.env.RECONCILAR_MINUTOS ?? 10);

async function reconciliarAnulaciones() {
  const pendientes = await prisma.webpayTransaction.findMany({
    where: { status: 'REFUND_PENDING' },
    include: { order: true },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`\n--- Parte 1: anulaciones pendientes (${pendientes.length}) ---`);

  if (pendientes.length === 0) {
    console.log('  Ninguna.');
    return;
  }

  for (const txn of pendientes) {
    const dias = Math.floor((Date.now() - txn.createdAt.getTime()) / 86400000);
    const antiguedad =
      dias === 0
        ? 'hoy (ventana de anulacion abierta)'
        : `hace ${dias} dia(s) - la ventana de anulacion de debito YA CERRO`;

    console.log(
      `  ${txn.order.orderNumber}  $${txn.amount.toLocaleString('es-CL')}  ${antiguedad}`
    );

    if (!txn.token) {
      console.log('     [!!] sin token: revisar a mano.\n');
      continue;
    }
    if (dryRun) {
      console.log('     [dry-run] no se intento la anulacion.\n');
      continue;
    }

    // reponeStock: false. Estos pedidos nunca descontaron stock: la
    // transaccion de confirmacion hizo rollback. Reponerlo inflaria el
    // inventario con mercaderia que nunca salio de la bodega.
    const r = await anularPago({
      token: txn.token,
      orderId: txn.orderId,
      motivo: 'Reintento batch de reconciliacion (npm run pagos:reconciliar)',
      reponeStock: false
    });

    if (r.ok) {
      console.log('     [OK] anulado en Transbank.\n');
    } else {
      console.log(`     [!!] fallo: ${r.error}`);
      console.log(
        '         Si la ventana de anulacion ya cerro, devuelve la plata por otra via.\n'
      );
    }
  }
}

async function reconciliarCommits() {
  const corte = new Date(Date.now() - MINUTOS_ESPERA * 60000);

  const sinConfirmar = await prisma.webpayTransaction.findMany({
    where: { status: 'COMMITTED', updatedAt: { lt: corte } },
    include: { order: true },
    orderBy: { createdAt: 'asc' }
  });

  console.log(
    `\n--- Parte 2: pagos sin confirmar, mas de ${MINUTOS_ESPERA} min (${sinConfirmar.length}) ---`
  );

  if (sinConfirmar.length === 0) {
    console.log('  Ninguno.');
    return;
  }

  const webpay = new WebpayPlusService();

  for (const txn of sinConfirmar) {
    const minutos = Math.round(
      (Date.now() - txn.updatedAt.getTime()) / 60000
    );
    console.log(
      `  ${txn.order.orderNumber}  $${txn.amount.toLocaleString('es-CL')}  hace ${minutos} min  (${txn.order.paymentStatus})`
    );

    if (!txn.token || dryRun) {
      console.log('     [dry-run/sin token] no se consulto Transbank.\n');
      continue;
    }

    let remoto: any;
    try {
      remoto = await webpay.getTransactionStatus(txn.token);
    } catch (e: any) {
      console.log(`     [!!] Transbank no responde: ${e.message}\n`);
      continue;
    }

    const estado = remoto?.status ?? 'desconocido';
    console.log(`     Estado real en Transbank: ${estado}`);

    if (estado === 'AUTHORIZED') {
      // Si se cobro, el cliente tiene plata pagada y un pedido que nunca
      // se confirmo. QUE HACER aqui es decision comercial: o se confirma
      // la entrega, o se devuelve la plata. El script no lo decide solo
      // porque devolver por cuenta propia puede tirar una venta viable.
      console.log(
        '     [!!] COBRADO SIN PEDIDO CONFIRMADO. Decidir: confirmar la entrega o devolver la plata.'
      );
      console.log(`         Pedido ${txn.order.orderNumber}, cliente ${txn.order.customerEmail}.\n`);
      continue;
    }

    if (estado === 'REJECTED' || estado === 'ABORTED' || estado === 'FAILED') {
      // No se cobro: se reabre el pedido para que el cliente pueda
      // reintentar sin riesgo de doble cobro.
      await prisma.webpayTransaction.update({
        where: { id: txn.id },
        data: {
          status: 'INITIATED',
          rawResponse: JSON.stringify({
            reconciliado: true,
            estadoRemoto: remoto
          })
        }
      });
      console.log('     [OK] no se habia cobrado: pedido reabierto.\n');
      continue;
    }

    console.log(
      `     [??] Estado '${estado}': no se toca. Revisar manualmente.\n`
    );
  }
}

async function run() {
  console.log(`\n=== RECONCILIACION DE PAGOS ===${dryRun ? ' (EN SECO)' : ''}`);
  console.log(
    `  Anulaciones con mas de 1 dia: Transbank ya no las permitira. Revisar a mano.`
  );

  await reconciliarAnulaciones();
  await reconciliarCommits();

  console.log('\n=== FIN ===\n');
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });