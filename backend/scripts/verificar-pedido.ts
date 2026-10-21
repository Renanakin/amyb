/**
 * Verifica el estado final de un pedido pagado: pago, logistica, DTE,
 * descuento de stock y registro de la transaccion en Transbank.
 *
 * Ejecutar: npx tsx scripts/verificar-pedido.ts [orderNumber]
 */
import { prisma } from '../src/lib/prisma.js';

async function run() {
  const orderNumber = process.argv[2];
  const order = await prisma.order.findFirst({
    where: orderNumber ? { orderNumber } : undefined,
    include: { items: true, transactions: true },
    orderBy: { createdAt: 'desc' }
  });

  if (!order) {
    console.log('No se encontro el pedido.');
    return;
  }

  console.log(`\n=== PEDIDO ${order.orderNumber} ===\n`);
  console.log(`  Pago:        ${order.paymentStatus}`);
  console.log(`  Logistica:   ${order.orderStatus}`);
  console.log(`  Metodo:      ${order.paymentMethod}`);
  console.log(`  Total:       $${order.total.toLocaleString('es-CL')}`);
  console.log(`  DTE folio:   ${order.dteFolio ?? '(sin emitir)'}`);

  console.log(`\n  Items:`);
  for (const i of order.items) {
    console.log(`    ${i.quantity} x ${i.productName} @ $${i.unitPrice} = $${i.subtotal}`);
  }

  console.log(`\n  Transacciones Webpay:`);
  if (order.transactions.length === 0) {
    console.log('    (ninguna)');
  }
  for (const t of order.transactions) {
    console.log(`    estado:       ${t.status}`);
    console.log(`    monto:        $${t.amount}`);
    console.log(`    tarjeta:      ${t.cardNumber ?? '-'}`);
    console.log(`    autorizacion: ${t.authorizationCode ?? '-'}`);
    console.log(`    tipo:         ${t.paymentTypeCode ?? '-'}`);
  }

  // Stock actual de los productos del pedido
  console.log(`\n  Stock actual:`);
  for (const i of order.items) {
    const p = await prisma.product.findUnique({
      where: { id: i.productId },
      select: { sku: true, name: true, stock: true }
    });
    console.log(`    ${p?.sku} ${p?.name}: ${p?.stock} unidades`);
  }

  // Validaciones
  // El resultado esperado depende del estado del pago: un pedido rechazado
  // NUNCA debe estar pagado, y su stock no debe haber bajado.
  console.log(`\n  Validaciones:`);

  if (order.paymentStatus === 'pagado') {
    console.log(`    [OK] pago confirmado`);
    console.log(
      `    ${order.transactions.some((t) => t.status === 'AUTHORIZED') ? '[OK]' : '[!!]'} transaccion AUTHORIZED`
    );
    console.log(`    ${order.dteFolio ? '[OK]' : '[!!]'} DTE emitido`);
  } else if (order.paymentStatus === 'rechazado') {
    console.log(`    [OK] pago rechazado (correcto: no se cobro)`);
    console.log(
      `    ${order.transactions.some((t) => t.status === 'REJECTED') ? '[OK]' : '[!!]'} transaccion REJECTED`
    );
    console.log(
      `    ${order.orderStatus === 'cancelado' ? '[OK]' : '[!!]'} orden cancelada`
    );
  } else {
    console.log(`    [OK] pago en estado '${order.paymentStatus}' (aun no resuelto)`);
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
