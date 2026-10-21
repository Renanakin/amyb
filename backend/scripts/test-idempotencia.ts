/**
 * Verifica que el endpoint /api/webpay/init sea idempotente:
 * un segundo llamado sobre la misma orden debe devolver el MISMO token,
 * nunca crear una transaccion nueva (evita el doble cobro).
 */
import { prisma } from '../src/lib/prisma.js';

const API = 'http://localhost:3001';

async function run() {
  // Se busca el pedido de prueba mas reciente, no uno de nombre fijo:
  // test-webpay genera un orderNumber distinto en cada ejecucion.
  const order = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: `AMYB-${new Date().getFullYear()}-T` } },
    orderBy: { createdAt: 'desc' }
  });

  if (!order) {
    console.log('No existe el pedido de prueba. Corre primero: npx tsx scripts/test-webpay.ts');
    return;
  }

  console.log(`Pedido: ${order.orderNumber} (estado de pago: ${order.paymentStatus})`);

  const antes = await prisma.webpayTransaction.count({
    where: { orderId: order.id }
  });

  const r1 = await fetch(`${API}/api/webpay/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.id })
  });
  const b1 = (await r1.json()) as any;

  const r2 = await fetch(`${API}/api/webpay/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.id })
  });
  const b2 = (await r2.json()) as any;

  const despues = await prisma.webpayTransaction.count({
    where: { orderId: order.id }
  });

  console.log(`\nLlamada 1 -> HTTP ${r1.status} | token: ${b1.data?.token?.slice(0, 20)}...`);
  console.log(`Llamada 2 -> HTTP ${r2.status} | token: ${b2.data?.token?.slice(0, 20)}...`);

  const mismoToken = b1.data?.token === b2.data?.token;
  const noDuplico = antes === despues;

  console.log(`\nTransacciones antes: ${antes} | despues: ${despues}`);
  console.log(`Mismo token devuelto: ${mismoToken ? 'OK' : 'FALLO'}`);
  console.log(`No se duplico la transaccion: ${noDuplico ? 'OK' : 'FALLO'}`);

  if (mismoToken && noDuplico) {
    console.log('\nRESULTADO: PASS — el init es idempotente, no hay riesgo de doble cobro.');
  } else {
    console.log('\nRESULTADO: FAIL — se esta creando una transaccion por cada llamada.');
    process.exitCode = 1;
  }
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
