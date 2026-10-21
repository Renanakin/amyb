/**
 * Diagnostico de una transaccion Webpay atascada.
 *
 * Ejecutar: npx tsx scripts/diagnostico-webpay.ts [token]
 *
 * Muestra el estado real de la transaccion en Transbank y en la base
 * de datos local, para entender por que un commit devuelve
 * "Transaction already locked by another process".
 */
import { prisma } from '../src/lib/prisma.js';
import { WebpayPlusService } from '../src/services/webpayService.js';

const webpay = new WebpayPlusService();

async function run() {
  const tokenArg = process.argv[2];

  const local = await prisma.webpayTransaction.findMany({
    include: { order: { select: { orderNumber: true, paymentStatus: true, total: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('=== ULTIMAS TRANSACCIONES EN LA BASE LOCAL ===\n');
  for (const t of local) {
    console.log(`  token:   ${t.token ?? '(sin token)'}`);
    console.log(`  pedido:  ${t.order.orderNumber}  total $${t.order.total}`);
    console.log(`  estado:  ${t.status}  | pago: ${t.order.paymentStatus}`);
    console.log(`  monto:   $${t.amount}`);
    console.log('');
  }

  // Consultar estado real en Transbank
  const tokens = tokenArg ? [tokenArg] : local.map((t) => t.token).filter(Boolean);

  console.log('=== ESTADO REAL EN TRANSBANK ===\n');
  for (const token of tokens) {
    try {
      const remote = await webpay.getTransactionStatus(token as string);
      console.log(`  ${token.slice(0, 20)}...`);
      console.log(`    status:        ${remote.status ?? '(ninguno)'}`);
      console.log(`    amount:        ${remote.amount ?? '-'}`);
      console.log(`    buy_order:     ${remote.buy_order ?? '-'}`);
      console.log(`    response_code: ${remote.response_code ?? '-'}`);
      console.log(`    card:          ${remote.card_detail?.card_number ?? '-'}`);
      console.log('');
    } catch (e: any) {
      console.log(`  ${token}: ERROR ${e.message}\n`);
    }
  }

  console.log('=== SIGNIFICADO ===');
  console.log('  INITIALIZED  = creada, el cliente aun no pago');
  console.log('  AUTHORIZED   = el banco autorizo, listo para commit');
  console.log('  REJECTED     = el banco rechazo');
  console.log('  "already locked" = Transbank esta procesando ese token ahora.');
  console.log('    Suele pasar si se llamo al commit dos veces seguidas.');
  console.log('    Espera unos segundos y reintenta el commit.');
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
