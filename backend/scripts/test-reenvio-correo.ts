/**
 * Pruebas del reenvio de correos.
 *
 * El fallo que cubren: el pago se confirma, el correo al cliente no sale,
 * y no hay ninguna forma de recuperarlo. Para un comprador B2B la factura
 * es lo que le permite pagar yDescending a contabilidad; sin ella, el
 * cliente le reclama a Amyb por un cobro que si ocurrio.
 *
 * En desarrollo el servicio de correo corre en modo captura: no sale nada
 * por la red, pero queda registro en email_logs, que es justo lo que hay
 * que comprobar.
 *
 * Requiere la base de datos. No necesita el backend arriba.
 *
 * Ejecutar: npx tsx scripts/test-reenvio-correo.ts
 */
import { prisma } from '../src/lib/prisma.js';
import {
  enviarCorreoDePedido,
  correosFallidos
} from '../src/services/notificaciones.js';

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, extra = '') {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} ${extra}`);
  }
}

async function crearPedido(estado: {
  paymentStatus: string;
  orderStatus: string;
  conFactura?: boolean;
}) {
  const sufijo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const producto = await prisma.product.create({
    data: {
      name: `Producto reenvio ${sufijo}`,
      sku: `TEST-RE-${sufijo}`.toUpperCase(),
      category: 'pruebas',
      format: 'Unidad',
      description: 'Creado por test-reenvio-correo.ts',
      brand: 'Pruebas',
      price: 5000,
      stock: 40,
      minWholesaleQty: 1,
      isActive: false
    }
  });

  const pedido = await prisma.order.create({
    data: {
      orderNumber: `AMYB-TEST-RE-${sufijo}`,
      customerNombre: 'Cliente Reenvio SpA',
      customerEmail: `reenvio.${sufijo}@amyb.cl`,
      customerTelefono: '+56900000000',
      subtotal: 25000,
      neto: 25000,
      iva: 0,
      total: 25000,
      paymentMethod: 'webpay',
      paymentStatus: estado.paymentStatus,
      orderStatus: estado.orderStatus,
      shippingZoneId: 'zone-temuco-centro',
      shippingZoneName: 'Temuco Centro',
      shippingAddress: 'Av. Alemania 0450, Temuco',
      items: {
        create: {
          productId: producto.id,
          productName: producto.name,
          productFormat: producto.format,
          quantity: 5,
          unitPrice: 5000,
          subtotal: 25000
        }
      }
    }
  });

  if (estado.conFactura) {
    await prisma.order.update({
      where: { id: pedido.id },
      data: {
        dteDocumentId: 7777,
        dteFolio: '99999',
        dteTipoDocumento: 'boleta',
        dtePdfUrl: 'https://sandbox.apifacto.com/v1/documents/7777/pdf'
      }
    });
  }

  const transaccion = await prisma.webpayTransaction.create({
    data: {
      orderId: pedido.id,
      token: `tok-reenvio-${sufijo}`,
      buyOrder: pedido.orderNumber,
      sessionId: `sess-${sufijo}`,
      amount: 25000,
      returnUrl: 'http://localhost:5173/webpay/return',
      status: 'AUTHORIZED',
      cardNumber: '0000',
      authorizationCode: '555555'
    }
  });

  return { producto, pedido, transaccion };
}

async function limpiar(pedidoId: string, productoId: string) {
  await prisma.emailLog.deleteMany({ where: { orderId: pedidoId } });
  await prisma.webpayTransaction.deleteMany({ where: { orderId: pedidoId } });
  await prisma.order.delete({ where: { id: pedidoId } });
  await prisma.product.delete({ where: { id: productoId } }).catch(() => {});
}

async function run() {
  console.log('\n=== REENVIO DE CORREOS ===\n');

  // -------------------------------------------------------------------
  console.log('[1] Reenvio de la factura de un pedido pagado');
  // -------------------------------------------------------------------
  const a = await crearPedido({
    paymentStatus: 'pagado',
    orderStatus: 'pagado',
    conFactura: true
  });

  const r1 = await enviarCorreoDePedido(a.pedido.id, 'factura');
  check('el envio se reporta exitoso', r1.ok === true, `(${r1.message})`);
  check('va al correo del cliente', r1.to === a.pedido.customerEmail, `(a: ${r1.to})`);
  check('es el tipo factura', r1.tipo === 'factura');

  const log1 = await prisma.emailLog.findFirst({
    where: { orderId: a.pedido.id },
    orderBy: { createdAt: 'desc' }
  });
  check('queda registrado en email_logs', log1 !== null);
  check('con el folio actual del pedido', (log1?.htmlGuardado ?? '').includes('99999'), '(no encontro el folio en el HTML)');
  check(
    'incluye el link de descarga del documento',
    (log1?.htmlGuardado ?? '').includes('apifacto.com'),
    '(no encontro el link del PDF)'
  );

  await limpiar(a.pedido.id, a.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[2] NO se manda factura de un pedido que no esta pagado');
  // -------------------------------------------------------------------
  // Un "pago aprobado" sobre una venta que no ocurrio es peor que no
  // mandar nada: el cliente cree que debe algo que no debe.
  const b = await crearPedido({
    paymentStatus: 'pendiente',
    orderStatus: 'pendiente'
  });

  let errorMsg = '';
  try {
    await enviarCorreoDePedido(b.pedido.id, 'factura');
  } catch (e: any) {
    errorMsg = e.message;
  }
  check('se niega a enviarlo', errorMsg !== '');
  check('explica que el pedido no esta pagado', /no pagado/.test(errorMsg), `(mensaje: ${errorMsg})`);

  const logsB = await prisma.emailLog.count({ where: { orderId: b.pedido.id } });
  check('no queda ningun correo registrado', logsB === 0, `(quedaron ${logsB})`);

  await limpiar(b.pedido.id, b.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[3] NO se avisa de despacho de un pedido cancelado');
  // -------------------------------------------------------------------
  const c = await crearPedido({
    paymentStatus: 'pagado',
    orderStatus: 'cancelado'
  });

  let errorDespacho = '';
  try {
    await enviarCorreoDePedido(c.pedido.id, 'despacho');
  } catch (e: any) {
    errorDespacho = e.message;
  }
  check('se niega a enviarlo', errorDespacho !== '');
  check('explica que confunde al cliente', /confunde/.test(errorDespacho), `(mensaje: ${errorDespacho})`);

  await limpiar(c.pedido.id, c.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[4] Aviso de despacho de un pedido despachado');
  // -------------------------------------------------------------------
  const d = await crearPedido({
    paymentStatus: 'pagado',
    orderStatus: 'despachado'
  });

  const r4 = await enviarCorreoDePedido(d.pedido.id, 'despacho');
  check('el envio se reporta exitoso', r4.ok === true, `(${r4.message})`);
  check('es el tipo despacho', r4.tipo === 'despacho');

  await limpiar(d.pedido.id, d.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[5] La cola de correos fallidos los encuentra');
  // -------------------------------------------------------------------
  const e = await crearPedido({
    paymentStatus: 'pagado',
    orderStatus: 'pagado',
    conFactura: true
  });

  // Se simula el fallo que dejo el pedido sin aviso.
  await prisma.emailLog.create({
    data: {
      orderId: e.pedido.id,
      tipo: 'factura',
      destinatario: e.pedido.customerEmail,
      asunto: 'Pago aprobado',
      estado: 'fallido',
      error: 'SMTPECONNREFUSED (simulado)'
    }
  });

  const fallidos = await correosFallidos();
  const aparece = fallidos.some((f) => f.orderId === e.pedido.id);
  check('el correo fallido aparece en la cola', aparece, `(hay ${fallidos.length} en la cola)`);
  check(
    'con el pedido asociado para poder reenviar',
    fallidos.find((f) => f.orderId === e.pedido.id)?.order?.orderNumber ===
      e.pedido.orderNumber
  );

  await limpiar(e.pedido.id, e.producto.id);

  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);

  if (fail > 0) {
    throw new Error(`${fail} prueba(s) de reenvio fallaron.`);
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