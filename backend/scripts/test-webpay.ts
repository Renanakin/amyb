/**
 * Prueba de integracion del flujo Webpay Plus contra el ambiente de
 * desarrollo (Integration) de Transbank.
 *
 * Ejecutar con el backend arriba:  npx tsx scripts/test-webpay.ts
 *
 * Simula: crear orden -> /api/webpay/init -> comprobar que Transbank
 * devuelve token y URL de pasarela. NO completa el pago (eso requiere
 * la tarjeta de prueba en el navegador), pero valida que las
 * credenciales y el contrato de la API son correctos.
 */
import { prisma } from '../src/lib/prisma.js';

const API = 'http://localhost:3001';

async function run() {
  console.log('=== PRUEBA WEBPAY PLUS (ambiente Integration) ===\n');

  // 1. Crear un pedido de prueba directamente en la base de datos
  const product = await prisma.product.findFirst({ where: { isActive: true } });
  if (!product) throw new Error('No hay productos en la base de datos. Corre el seed.');

  // Numero unico por ejecucion: el script debe poder correr varias veces
  // sin chocar con el constraint de order_number.
  const orderNumber = `AMYB-${new Date().getFullYear()}-T${Date.now()
    .toString()
    .slice(-6)}`;
  const subtotal = product.price * 2;
  const neto = Math.round(subtotal / 1.19);
  const iva = subtotal - neto;

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerNombre: 'Cliente Prueba Webpay',
      customerEmail: 'prueba@amybdistribuidora.cl',
      customerTelefono: '+56 9 0000 0000',
      dteTipoDocumento: 'boleta',
      subtotal,
      neto,
      iva,
      costoEnvio: 2990,
      total: subtotal + 2990,
      paymentMethod: 'webpay',
      paymentStatus: 'pendiente',
      orderStatus: 'pendiente',
      shippingZoneId: 'zone-temuco-centro',
      shippingZoneName: 'Temuco Centro & Poniente',
      shippingAddress: 'Av. Alemania 0890, Temuco',
      items: {
        create: {
          productId: product.id,
          productName: product.name,
          productFormat: product.format,
          quantity: 2,
          unitPrice: product.price,
          subtotal
        }
      }
    }
  });

  console.log(`[1] Pedido creado: ${order.orderNumber}`);
  console.log(`    Producto: ${product.name} x2 = $${subtotal.toLocaleString('es-CL')}`);
  console.log(`    Total a cobrar: $${order.total.toLocaleString('es-CL')}\n`);

  // 2. Llamar a /api/webpay/init
  console.log('[2] Llamando POST /api/webpay/init contra Transbank...');
  const res = await fetch(`${API}/api/webpay/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.id })
  });
  const body = (await res.json()) as any;

  if (!res.ok || !body.success) {
    console.error('    FALLO:', JSON.stringify(body, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`    [OK] Token recibido: ${body.data.token.slice(0, 20)}...`);
  console.log(`    [OK] URL pasarela:   ${body.data.url}`);
  console.log(`    [OK] Monto enviado:  $${body.data.amount.toLocaleString('es-CL')}`);

  // 3. Verificar que la transaccion quedo registrada ANTES del commit
  const txn = await prisma.webpayTransaction.findUnique({
    where: { token: body.data.token }
  });
  console.log(
    `\n[3] Registro en base de datos: ${txn ? 'OK' : 'FALLO'} (status=${txn?.status})`
  );

  // 4. Probar idempotencia: reintentar init sobre la misma orden
  console.log('\n[4] Prueba de validacion: reintento de /init sobre el mismo pedido...');
  const retry = await fetch(`${API}/api/webpay/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.id })
  });
  const retryBody = (await retry.json()) as any;
  console.log(
    `    Estado ${retry.status}: ${retryBody.success ? 'permitio' : 'rechazo'} -> ${
      retryBody.message || ''
    }`
  );

  // 5. Consulta de estado contra Transbank
  console.log('\n[5] GET /api/webpay/status/:token (reconciliacion)...');
  const st = await fetch(`${API}/api/webpay/status/${body.data.token}`);
  const stBody = (await st.json()) as any;
  if (stBody.success) {
    console.log(`    Estado Transbank: ${JSON.stringify(stBody.data.transbank)}`);
  } else {
    console.log(`    Respuesta: ${JSON.stringify(stBody)}`);
  }

  console.log('\n=== FIN DE LA PRUEBA ===');
  console.log('Para completar el pago: usar la tarjeta de prueba Transbank');
  console.log('  4051885600446623  /  cvv 123  /  fecha futura');
  console.log('  (resultado AUTHORIZED)');
  console.log('  5200000000000007  -> rechazo por fondos insuficientes');
}

run()
  .catch((e) => {
    console.error('ERROR EN LA PRUEBA:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
