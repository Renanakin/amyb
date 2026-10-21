/**
 * Pruebas del commit que termina en estado desconocido.
 *
 * El escenario: Transbank autoriza el pago y la respuesta se pierde (se cae
 * la red, expira el timeout, el proceso se reinicia). El cliente ve "el
 * pago fallo" y reintenta. Si el sistema dio el cobro por perdido en ese
 * momento, la tienda queda con la plata cobrada y sin pedido.
 *
 * Se reproduce sin Transbank real: se reemplaza commitTransaction y
 * getTransactionStatus en memoria.
 *
 * No necesita el backend arriba: prueba la logica compartida de /commit.
 */
import { prisma } from '../src/lib/prisma.js';
import { WebpayPlusService } from '../src/services/webpayService.js';
import { processCommit } from '../src/routes/webpay.js';



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
// Simulador de Transbank
// ---------------------------------------------------------------------
const commitOriginal = WebpayPlusService.prototype.commitTransaction;
const statusOriginal = WebpayPlusService.prototype.getTransactionStatus;

type Modo =
  | 'commit-falla-estado-authorized' // la respuesta se perdio, si se cobro
  | 'commit-falla-estado-rejected' // se perdio, pero NO se cobro
  | 'commit-falla-sin-estado' // ni el commit ni la consulta responden
  | 'commit-falla-estado-null'; // Transbank responde sin estado util

let modo: Modo = 'commit-falla-sin-estado';

WebpayPlusService.prototype.commitTransaction = async function (
  _token: string
): Promise<any> {
  // Se simula la perdida de la respuesta: Transbank cobro, pero el
  // cliente (nuestro servidor) no se entera.
  throw new Error('fetch failed: socket hang up (simulado)');
};

WebpayPlusService.prototype.getTransactionStatus = async function (
  _token: string
): Promise<any> {
  if (modo === 'commit-falla-sin-estado') {
    throw new Error('Timeout al consultar Transbank (simulado)');
  }
  if (modo === 'commit-falla-estado-null') {
    return { status: null };
  }
  if (modo === 'commit-falla-estado-authorized') {
    return {
      vci: 'mock-vci',
      status: 'AUTHORIZED',
      buy_order: 'MOCK-ORDER',
      session_id: 'mock-session',
      amount: 25000,
      card_detail: { card_number: 'XXXX XXXX XXXX 0000' },
      accounting_date: '20261005',
      transaction_date: '2026-10-05T15:00:00.000Z',
      authorization_code: '121343',
      payment_type_code: 'CD',
      response_code: 0,
      installments_number: 1
    };
  }
  return { status: 'REJECTED', response_code: -1 };
};

/** Transbank en modo normal: el commit funciona. */
function restaurarCommit() {
  WebpayPlusService.prototype.commitTransaction = commitOriginal;
}

async function crearOrdenConTransaccion() {
  const sufijo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const producto = await prisma.product.create({
    data: {
      name: `Producto commit desconocido ${sufijo}`,
      sku: `TEST-CD-${sufijo}`.toUpperCase(),
      category: 'pruebas',
      format: 'Unidad',
      description: 'Creado por test-commit-desconocido.ts',
      brand: 'Pruebas',
      price: 5000,
      stock: 50,
      minWholesaleQty: 1,
      isActive: false
    }
  });

  const pedido = await prisma.order.create({
    data: {
      orderNumber: `AMYB-TEST-CD-${sufijo}`,
      customerNombre: 'Cliente Commit Desconocido SpA',
      customerEmail: `commit.${sufijo}@amyb.cl`,
      customerTelefono: '+56900000000',
      subtotal: 25000,
      neto: 25000,
      iva: 0,
      total: 25000,
      paymentMethod: 'webpay',
      paymentStatus: 'pendiente',
      orderStatus: 'pendiente',
      shippingZoneId: 'zone-temuco-centro',
      shippingZoneName: 'Temuco Centro',
      shippingAddress: 'Av. Alemania 0450, Temuco',
      // Sale de Bodega Central, la unica con filas de stock. El stock
      // vive ahi; products.stock es solo la cache agregada.
      warehouseId: 'wh-central',
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

  await prisma.warehouseStock.create({
    data: {
      warehouseId: 'wh-central',
      productId: producto.id,
      quantity: 50,
      reserved: 0
    }
  });

  const transaccion = await prisma.webpayTransaction.create({
    data: {
      orderId: pedido.id,
      token: `tok-commit-${sufijo}`,
      buyOrder: 'MOCK-ORDER',
      sessionId: `sess-${sufijo}`,
      amount: 25000,
      returnUrl: 'http://localhost:5173/webpay/return',
      status: 'INITIATED'
    }
  });

  return { producto, pedido, transaccion };
}

async function confirmar(token: string) {
  // Se llama la logica compartida de /commit y /return directamente: el
  // parche del prototipo solo aplica a ESTE proceso, asi que probar por
  // HTTP hablaria con el servidor real, que no tiene el simulador.
  return processCommit(token);
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
  console.log('\n=== COMMIT CON ESTADO DESCONOCIDO ===\n');

  // -------------------------------------------------------------------
  console.log('[1] La respuesta del commit se perdio, pero SI se cobro');
  // -------------------------------------------------------------------
  // El caso peligroso: Transbank autorizo y nosotros no nos enteramos.
  // El sistema debe seguir por el camino de exito, NO fallar.
  modo = 'commit-falla-estado-authorized';
  const a = await crearOrdenConTransaccion();
  const stockAntesA = a.producto.stock;

  const r1 = await confirmar(a.transaccion.token!);
  check(
    'responde exito aunque la llamada haya fallado',
    r1.authorized === true,
    `(respuesta: ${JSON.stringify(r1).slice(0, 120)})`
  );

  const pedidoA = await prisma.order.findUnique({ where: { id: a.pedido.id } });
  check(
    'el pedido queda pagado',
    pedidoA?.paymentStatus === 'pagado',
    `(estado: ${pedidoA?.paymentStatus})`
  );

  const txnA = await prisma.webpayTransaction.findUnique({
    where: { id: a.transaccion.id }
  });
  check(
    'la transaccion queda AUTHORIZED',
    txnA?.status === 'AUTHORIZED',
    `(estado: ${txnA?.status})`
  );

  const productoA = await prisma.product.findUnique({
    where: { id: a.producto.id }
  });
  check(
    'el stock se desconto (la venta ocurrio de verdad)',
    productoA?.stock === stockAntesA - 5,
    `(antes: ${stockAntesA}, ahora: ${productoA?.stock})`
  );

  await limpiar(a.pedido.id, a.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[2] La respuesta se perdio y Transbank confirma que NO se cobro');
  // -------------------------------------------------------------------
  modo = 'commit-falla-estado-rejected';
  const b = await crearOrdenConTransaccion();

  // Cuando Transbank responde y NO autorizo, sabemos que no se cobro, asi
  // que el error se propaga para que el cliente vea que fallo de verdad.
  let lanzoError = false;
  try {
    await confirmar(b.transaccion.token!);
  } catch {
    lanzoError = true;
  }
  check(
    'propaga el error al cliente: se sabe que no se cobro',
    lanzoError,
    `(no lanzo el error)`
  );

  const pedidoB = await prisma.order.findUnique({ where: { id: b.pedido.id } });
  check(
    'el pedido sigue pendiente',
    pedidoB?.paymentStatus === 'pendiente',
    `(estado: ${pedidoB?.paymentStatus})`
  );

  const txnB = await prisma.webpayTransaction.findUnique({
    where: { id: b.transaccion.id }
  });
  check(
    'la transaccion se reabre a INITIATED para poder reintentar',
    txnB?.status === 'INITIATED',
    `(estado: ${txnB?.status})`
  );

  await limpiar(b.pedido.id, b.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[3] Ni el commit ni la consulta responden: estado desconocido');
  // -------------------------------------------------------------------
  // Lo que NO se debe hacer: reabrir el pedido. Si se reabre y el pago si
  // se habia concretado, el cliente puede pagar dos veces.
  modo = 'commit-falla-sin-estado';
  const c = await crearOrdenConTransaccion();

  const r3 = await confirmar(c.transaccion.token!);
  check(
    'NO afirma que el pago se confirmo',
    r3.authorized === false,
    `(autorizado: ${r3.authorized})`
  );
  check(
    'informa que se esta verificando el pago',
    r3.paymentPendingVerification === true,
    `(respuesta: ${JSON.stringify(r3).slice(0, 140)})`
  );

  const txnC = await prisma.webpayTransaction.findUnique({
    where: { id: c.transaccion.id }
  });
  check(
    'la transaccion NO se reabre: queda pendiente de reconciliar',
    txnC?.status === 'COMMITTED',
    `(estado: ${txnC?.status})`
  );
  check(
    'queda registrado por que se quedo sin resolver',
    (txnC?.rawResponse ?? '').includes('Estado desconocido'),
    `(raw: ${(txnC?.rawResponse ?? '').slice(0, 90)})`
  );

  const pedidoC = await prisma.order.findUnique({ where: { id: c.pedido.id } });
  check(
    'el pedido NO se cancela ni se paga solo',
    pedidoC?.paymentStatus === 'pendiente',
    `(estado: ${pedidoC?.paymentStatus})`
  );

  await limpiar(c.pedido.id, c.producto.id);

  // -------------------------------------------------------------------
  console.log('\n[4] Transbank responde sin estado util');
  // -------------------------------------------------------------------
  modo = 'commit-falla-estado-null';
  const d = await crearOrdenConTransaccion();

  const r4 = await confirmar(d.transaccion.token!);
  check(
    'tampoco se afirma un pago que no se puede confirmar',
    r4.authorized === false,
    `(autorizado: ${r4.authorized})`
  );

  const txnD = await prisma.webpayTransaction.findUnique({
    where: { id: d.transaccion.id }
  });
  check(
    'queda pendiente de reconciliar en vez de reabrirse',
    txnD?.status === 'COMMITTED',
    `(estado: ${txnD?.status})`
  );

  await limpiar(d.pedido.id, d.producto.id);

  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);

  if (fail > 0) {
    throw new Error(`${fail} prueba(s) de commit fallaron.`);
  }
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    WebpayPlusService.prototype.commitTransaction = commitOriginal;
    WebpayPlusService.prototype.getTransactionStatus = statusOriginal;
    restaurarCommit();
    await prisma.$disconnect();
  });