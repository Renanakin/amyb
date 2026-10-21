/**
 * Pruebas de la anulacion de pagos (refund).
 *
 * Estas pruebas cubren el peor escenario posible de una tienda: que
 * Transbank haya COBRADO y que la confirmacion del pedido falle (por
 * ejemplo porque dos clientes compitieron por la ultima unidad). Si ese
 * camino no devuelve la plata, el cliente paga y no recibe nada.
 *
 * Ejecutar con el backend y la base arriba:  npx tsx scripts/test-anulacion.ts
 *
 * No se usa la pasarela real: se reemplaza refundTransaction en memoria
 * para poder verificar el efecto en la base sin depender de Transbank ni
 * gastar una operacion real.
 */
import { prisma } from '../src/lib/prisma.js';
import { WebpayPlusService } from '../src/services/webpayService.js';
import { anularPago } from '../src/routes/webpay.js';

const API = 'http://localhost:3001';

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

// ---------------------------------------------------------------------
// Se reemplaza la llamada a Transbank para no depender de la pasarela.
// ---------------------------------------------------------------------
const refundOriginal = WebpayPlusService.prototype.refundTransaction;
let refundDebeFallar = false;
let refundLlamado = 0;

WebpayPlusService.prototype.refundTransaction = async function (
  _token: string,
  _amount?: number
): Promise<any> {
  refundLlamado++;
  if (refundDebeFallar) {
    throw new Error('Transbank rechazo la anulacion (HTTP 422, simulada)');
  }
  return { status: 'success', refund_type: 2, simulated: true };
};

/** Crea el escenario: producto, pedido, item y transaccion pagada. */
async function crearEscenario(opts: {
  cantidad: number;
  stockInicial: number;
  // En el esquema estos son columnas de texto, no enums: el test puede
  // dejar el pedido en cualquier estado para reproducir cada escenario.
  estadoPedido: string;
  estadoTransaccion: string;
}) {
  const sufijo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const producto = await prisma.product.create({
    data: {
      name: `Producto de prueba anulacion ${sufijo}`,
      sku: `TEST-ANUL-${sufijo}`.toUpperCase(),
      category: 'pruebas',
      format: 'Unidad',
      description: 'Producto creado por test-anulacion.ts para verificar reembolsos',
      brand: 'Pruebas',
      price: 5000,
      stock: opts.stockInicial,
      minWholesaleQty: 1,
      isActive: false
    }
  });

  const pedido = await prisma.order.create({
    data: {
      orderNumber: `AMYB-TEST-ANUL-${sufijo}`,
      customerNombre: 'Cliente Anulacion SpA',
      customerEmail: `anulacion.${sufijo}@amyb.cl`,
      customerTelefono: '+56900000000',
      subtotal: opts.cantidad * 5000,
      neto: opts.cantidad * 5000,
      iva: 0,
      total: opts.cantidad * 5000,
      paymentMethod: 'webpay',
      paymentStatus: opts.estadoPedido,
      orderStatus: opts.estadoPedido === 'pagado' ? 'pagado' : 'cancelado',
      shippingZoneId: 'zone-temuco-centro',
      shippingZoneName: 'Temuco Centro',
      shippingAddress: 'Av. Alemania 0450, Temuco',
      // El pedido sale de Bodega Central, que es la unica que tiene filas
      // de stock. Sin esto, la reposicion de la anulacion no tendria donde
      // dejar la mercaderia.
      warehouseId: 'wh-central',
      items: {
        create: {
          productId: producto.id,
          productName: producto.name,
          productFormat: producto.format,
          quantity: opts.cantidad,
          unitPrice: 5000,
          subtotal: opts.cantidad * 5000
        }
      }
    }
  });

  // El stock vive en la bodega, no en el producto. El campo del producto
  // queda como cache, que es lo que este test mira.
  await prisma.warehouseStock.create({
    data: {
      warehouseId: 'wh-central',
      productId: producto.id,
      quantity: opts.stockInicial,
      reserved: 0
    }
  });

  const transaccion = await prisma.webpayTransaction.create({
    data: {
      orderId: pedido.id,
      token: `tok-anulacion-${sufijo}`,
      buyOrder: pedido.orderNumber,
      sessionId: `sess-${sufijo}`,
      amount: opts.cantidad * 5000,
      returnUrl: 'http://localhost:5173/webpay/return',
      status: opts.estadoTransaccion
    }
  });

  return { producto, pedido, transaccion };
}

async function limpiar(pedidoId: string, productoId: string) {
  await prisma.emailLog.deleteMany({ where: { orderId: pedidoId } });
  await prisma.stockMovement.deleteMany({ where: { orderId: pedidoId } });
  await prisma.webpayTransaction.deleteMany({ where: { orderId: pedidoId } });
  await prisma.order.delete({ where: { id: pedidoId } });
  await prisma.warehouseStock.deleteMany({ where: { productId: productoId } });
  await prisma.product.delete({ where: { id: productoId } }).catch(() => {});
}

async function run() {
  console.log('\n=== ANULACION DE PAGOS ===\n');

  // -------------------------------------------------------------------
  console.log('[1] Transbank autorizo pero la confirmacion fallo por stock');
  // -------------------------------------------------------------------
  const a = await crearEscenario({
    cantidad: 5,
    stockInicial: 2, // NO hay stock: es el escenario del fallo
    estadoPedido: 'rechazado',
    estadoTransaccion: 'COMMITTED'
  });
  const stockAntes = a.producto.stock;

  const r1 = await anularPago({
    token: a.transaccion.token!,
    orderId: a.pedido.id,
    motivo: 'Stock insuficiente para "Producto de prueba" al momento de confirmar.',
    reponeStock: false,
    respuestaCommit: { amount: 25000, response_code: 0 }
  });

  check('la anulacion se ejecuta correctamente', r1.ok === true, `(${r1.error})`);
  check('se llama a Transbank para devolver la plata', refundLlamado === 1);

  const pedido1 = await prisma.order.findUnique({ where: { id: a.pedido.id } });
  check(
    'el pedido queda como reembolsado',
    pedido1?.paymentStatus === 'reembolsado',
    `(estado: ${pedido1?.paymentStatus})`
  );
  check(
    'el pedido queda cancelado en logistica',
    pedido1?.orderStatus === 'cancelado',
    `(estado: ${pedido1?.orderStatus})`
  );

  const txn1 = await prisma.webpayTransaction.findUnique({
    where: { token: a.transaccion.token! }
  });
  check(
    'la transaccion queda como REFUNDED',
    txn1?.status === 'REFUNDED',
    `(estado: ${txn1?.status})`
  );
  check(
    'queda el motivo de la anulacion en la auditoria',
    (txn1?.rawResponse ?? '').includes('Stock insuficiente'),
    `(raw: ${(txn1?.rawResponse ?? '').slice(0, 80)})`
  );

  // ESTA es la comprobacion critica: en este camino la transaccion de
  // confirmacion hizo rollback, asi que el stock NUNCA se desconto.
  // Reponerlo crearia mercaderia fantasma en la bodega.
  const producto1 = await prisma.product.findUnique({
    where: { id: a.producto.id }
  });
  check(
    'el stock NO se repone (nunca se habia descontado)',
    producto1?.stock === stockAntes,
    `(antes: ${stockAntes}, ahora: ${producto1?.stock})`
  );

  await limpiar(a.pedido.id, a.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[2] Anulacion de un pedido que SI habia descontado stock');
  // -------------------------------------------------------------------
  const b = await crearEscenario({
    cantidad: 4,
    stockInicial: 4, // se descontaron 4 al confirmar
    estadoPedido: 'pagado',
    estadoTransaccion: 'AUTHORIZED'
  });
  const stockAntesB = b.producto.stock;
  refundLlamado = 0;

  const r2 = await anularPago({
    token: b.transaccion.token!,
    orderId: b.pedido.id,
    motivo: 'Anulacion manual solicitada desde el panel',
    reponeStock: true
  });

  check('la anulacion se ejecuta correctamente', r2.ok === true, `(${r2.error})`);

  const producto2 = await prisma.product.findUnique({
    where: { id: b.producto.id }
  });
  check(
    'el stock SI se repone cuando si se habia descontado',
    producto2?.stock === stockAntesB + 4,
    `(antes: ${stockAntesB}, ahora: ${producto2?.stock}, esperado: ${stockAntesB + 4})`
  );

  await limpiar(b.pedido.id, b.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[3] Transbank rechaza la anulacion: queda pendiente, no se pierde');
  // -------------------------------------------------------------------
  const c = await crearEscenario({
    cantidad: 2,
    stockInicial: 0,
    estadoPedido: 'rechazado',
    estadoTransaccion: 'COMMITTED'
  });
  refundDebeFallar = true;
  refundLlamado = 0;

  const r3 = await anularPago({
    token: c.transaccion.token!,
    orderId: c.pedido.id,
    motivo: 'Stock insuficiente para "Producto de prueba" al momento de confirmar.',
    reponeStock: false
  });

  check('la anulacion reporta el fallo', r3.ok === false);
  check('el error de Transbank queda disponible', (r3.error ?? '').includes('422'));

  const pedido3 = await prisma.order.findUnique({ where: { id: c.pedido.id } });
  check(
    'el pedido queda en reembolso_pendiente (visible en el panel)',
    pedido3?.paymentStatus === 'reembolso_pendiente',
    `(estado: ${pedido3?.paymentStatus})`
  );

  const txn3 = await prisma.webpayTransaction.findUnique({
    where: { token: c.transaccion.token! }
  });
  check(
    'la transaccion queda como REFUND_PENDING para reconciliar',
    txn3?.status === 'REFUND_PENDING',
    `(estado: ${txn3?.status})`
  );

  await limpiar(c.pedido.id, c.producto.id);
  refundDebeFallar = false;

  // -------------------------------------------------------------------
  console.log('\n[4] El panel no puede anular dos veces el mismo pedido');
  // -------------------------------------------------------------------
  const d = await crearEscenario({
    cantidad: 1,
    stockInicial: 5,
    estadoPedido: 'reembolsado',
    estadoTransaccion: 'REFUNDED'
  });

  const guard = await fetch(`${API}/api/webpay/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: d.pedido.id })
  });
  const guardBody = await guard.json();

  check(
    'rechaza con 400 un pedido ya reembolsado',
    guard.status === 400,
    `(HTTP ${guard.status})`
  );
  check(
    'el mensaje explica el estado actual',
    (guardBody?.message ?? '').includes('reembolsado'),
    `(mensaje: ${guardBody?.message})`
  );

  const producto4 = await prisma.product.findUnique({
    where: { id: d.producto.id }
  });
  check(
    'el stock no se toco al rechazar la doble anulacion',
    producto4?.stock === 5,
    `(stock: ${producto4?.stock})`
  );

  await limpiar(d.pedido.id, d.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[5] No se puede devolver la plata de una venta ya facturada');
  // -------------------------------------------------------------------
  // La factura queda en el libro del SII para siempre. Devolver el dinero
  // sin emitir la Nota de Credito deja al cliente con una factura por una
  // compra que no ocurrio. El endpoint tiene que negarse.
  const e = await crearEscenario({
    cantidad: 3,
    stockInicial: 10,
    estadoPedido: 'pagado',
    estadoTransaccion: 'AUTHORIZED'
  });

  await prisma.order.update({
    where: { id: e.pedido.id },
    data: {
      dteDocumentId: 8888,
      dteFolio: '12345',
      dteTipoDocumento: 'factura'
    }
  });

  const guard2 = await fetch(`${API}/api/webpay/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: e.pedido.id })
  });
  const guard2Body = await guard2.json();

  check(
    'rechaza con 409 devolver la plata de una venta facturada',
    guard2.status === 409,
    `(HTTP ${guard2.status})`
  );
  check(
    'el mensaje dice que falta la Nota de Credito',
    (guard2Body?.message ?? '').includes('Nota de Credito'),
    `(mensaje: ${guard2Body?.message})`
  );
  check(
    'devuelve el folio a anular',
    guard2Body?.dte?.folio === '12345',
    `(folio: ${guard2Body?.dte?.folio})`
  );

  const pedido5 = await prisma.order.findUnique({ where: { id: e.pedido.id } });
  check(
    'el pedido sigue pagado: no se devolvio la plata',
    pedido5?.paymentStatus === 'pagado',
    `(estado: ${pedido5?.paymentStatus})`
  );

  const producto5 = await prisma.product.findUnique({
    where: { id: e.producto.id }
  });
  check(
    'el stock no se toco',
    producto5?.stock === 10,
    `(stock: ${producto5?.stock})`
  );

  await limpiar(e.pedido.id, e.producto.id);

  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);

  if (fail > 0) {
    throw new Error(`${fail} prueba(s) de anulacion fallaron.`);
  }
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Restaurar la pasarela real antes de salir.
    WebpayPlusService.prototype.refundTransaction = refundOriginal;
    await prisma.$disconnect();
  });
