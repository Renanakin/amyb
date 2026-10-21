/**
 * Pruebas del paso 0.1: la salida del estado 'procesando'.
 *
 * El bug que cubren: 'procesando' se escribia en un solo lugar del codigo
 * y NINGUN otro lo revertia. Un cliente que abria la pasarela y cerraba el
 * navegador dejaba el pedido colgado para siempre, y el panel lo mostraba
 * igual que a un pago en curso.
 *
 * Lo que importa no es solo que se cierre: es que NO se cierre cuando no
 * hay seguridad. Dar por perdido un pago que si se cobro seria inventar el
 * estado, que es el mismo error que este paso viene a corregir.
 *
 * Ejecutar: npx tsx scripts/test-pagos-expirar.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { WebpayPlusService } from '../src/services/webpayService.js';
import {
  expirarPagosAbandonados,
  pagosColgados
} from '../src/services/pagos.js';

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

const statusOriginal = WebpayPlusService.prototype.getTransactionStatus;

let remotoActual: any = null;
let transbankFalla = false;

WebpayPlusService.prototype.getTransactionStatus = async function () {
  if (transbankFalla) throw new Error('Transbank no responde (simulado)');
  return remotoActual;
};

const creados: string[] = [];

async function crearPagoAbandonado(opts: {
  nombre: string;
  horasAntiguedad: number;
  conToken?: boolean;
}) {
  const sfx = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = `pago.${sfx}@amyb.cl`;

  const pedido = await prisma.order.create({
    data: {
      orderNumber: `AMYB-TEST-EXP-${sfx}`,
      customerNombre: opts.nombre,
      customerEmail: email,
      customerTelefono: '+56900000000',
      subtotal: 10000,
      neto: 10000,
      iva: 0,
      total: 10000,
      paymentMethod: 'webpay',
      paymentStatus: 'procesando',
      orderStatus: 'pendiente',
      shippingZoneId: 'zone-temuco-centro',
      shippingZoneName: 'Temuco Centro',
      shippingAddress: 'Av. Alemania 0450, Temuco',
      createdAt: new Date(Date.now() - opts.horasAntiguedad * 3600 * 1000)
    }
  });
  creados.push(pedido.id);

  const transaccion = await prisma.webpayTransaction.create({
    data: {
      orderId: pedido.id,
      token: opts.conToken === false ? null : `tok-exp-${sfx}`,
      buyOrder: pedido.orderNumber,
      sessionId: `sess-${sfx}`,
      amount: 10000,
      returnUrl: 'http://localhost:5173/webpay/return',
      status: 'INITIATED',
      createdAt: new Date(Date.now() - opts.horasAntiguedad * 3600 * 1000)
    }
  });

  return { pedido, transaccion };
}

async function limpiar() {
  await prisma.webpayTransaction.deleteMany({ where: { orderId: { in: creados } } });
  await prisma.order.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
}

async function run() {
  console.log('\n=== PAGOS ABANDONADOS ===\n');

  // -------------------------------------------------------------------
  console.log('[1] Transbank dice que nadie pago: se cierra');
  // -------------------------------------------------------------------
  remotoActual = { status: 'INITIATED' };
  transbankFalla = false;
  const a = await crearPagoAbandonado({ nombre: 'Cliente que se arrepintio', horasAntiguedad: 5 });

  const r1 = await expirarPagosAbandonados({ horas: 2 });
  check('lo cierra', r1.expirados.length >= 1, `(cerrados: ${r1.expirados.length})`);
  check('no lo reporta como cobrado de sorpresa', r1.cobradoSorpresivo.length === 0);

  const pedidoA = await prisma.order.findUnique({ where: { id: a.pedido.id } });
  check('el pedido vuelve a pendiente', pedidoA?.paymentStatus === 'pendiente', `(estado: ${pedidoA?.paymentStatus})`);

  const txnA = await prisma.webpayTransaction.findUnique({ where: { id: a.transaccion.id } });
  check('la transaccion queda ABORTED', txnA?.status === 'ABORTED', `(estado: ${txnA?.status})`);
  check('queda registrado por que se cerro', (txnA?.rawResponse ?? '').includes('abandono'));
  check('y por quien', (txnA?.rawResponse ?? '').includes('pagos:expirar'));

  await limpiar();

  // -------------------------------------------------------------------
  console.log('\n[2] Transbank dice que SI se cobro: NO se cierra');
  // -------------------------------------------------------------------
  // El caso peligroso. Un cliente que tarda en pagar y el script lo da por
  // muerto = plata cobrada y pedido sin despachar.
  remotoActual = { status: 'AUTHORIZED', amount: 10000 };
  const b = await crearPagoAbandonado({ nombre: 'Cliente lento pero pagó', horasAntiguedad: 5 });

  const r2 = await expirarPagosAbandonados({ horas: 2 });
  check('lo detecta como cobrado', r2.cobradoSorpresivo.length >= 1, `(sorpresivos: ${r2.cobradoSorpresivo.length})`);
  check('NO lo cierra', r2.expirados.length === 0, `(cerrados: ${r2.expirados.length})`);

  const txnB = await prisma.webpayTransaction.findUnique({ where: { id: b.transaccion.id } });
  check('la transaccion queda COMMITTED para reconciliar', txnB?.status === 'COMMITTED', `(estado: ${txnB?.status})`);
  check('queda anotado por que no se cerro', (txnB?.rawResponse ?? '').includes('despues de la ventana'));

  const pedidoB = await prisma.order.findUnique({ where: { id: b.pedido.id } });
  check('el pedido sigue en proceso, no se toca', pedidoB?.paymentStatus === 'procesando', `(estado: ${pedidoB?.paymentStatus})`);

  await limpiar();

  // -------------------------------------------------------------------
  console.log('\n[3] Transbank NO responde: NO se toca nada');
  // -------------------------------------------------------------------
  // Sin la verdad no se inventa. Un corte de red no puede convertir pagos
  // reales en pagos perdidos.
  remotoActual = { status: 'INITIATED' };
  transbankFalla = true;
  const c = await crearPagoAbandonado({ nombre: 'Cliente con red mala', horasAntiguedad: 5 });

  const r3 = await expirarPagosAbandonados({ horas: 2 });
  check('lo reporta como no verificable', r3.sinResolver.length >= 1, `(sin resolver: ${r3.sinResolver.length})`);
  check('NO lo cierra', r3.expirados.length === 0, `(cerrados: ${r3.expirados.length})`);

  const pedidoC = await prisma.order.findUnique({ where: { id: c.pedido.id } });
  check('el pedido sigue como estaba', pedidoC?.paymentStatus === 'procesando', `(estado: ${pedidoC?.paymentStatus})`);

  transbankFalla = false;
  await limpiar();

  // -------------------------------------------------------------------
  console.log('\n[4] Un pago reciente NO se toca');
  // -------------------------------------------------------------------
  remotoActual = { status: 'INITIATED' };
  const d = await crearPagoAbandonado({ nombre: 'Cliente pagando ahora', horasAntiguedad: 0.05 });

  const r4 = await expirarPagosAbandonados({ horas: 2 });
  check('no lo cierra por ser reciente', r4.expirados.length === 0, `(cerrados: ${r4.expirados.length})`);

  const pedidoD = await prisma.order.findUnique({ where: { id: d.pedido.id } });
  check('sigue en proceso', pedidoD?.paymentStatus === 'procesando', `(estado: ${pedidoD?.paymentStatus})`);

  await limpiar();

  // -------------------------------------------------------------------
  console.log('\n[5] Sin token no se inventa nada');
  // -------------------------------------------------------------------
  remotoActual = { status: 'INITIATED' };
  const e = await crearPagoAbandonado({
    nombre: 'Transaccion sin token',
    horasAntiguedad: 5,
    conToken: false
  });

  const r5 = await expirarPagosAbandonados({ horas: 2 });
  check(
    'lo reporta en vez de cerrarlo',
    r5.sinResolver.some((s) => /token/i.test(s.motivo)),
    `(sin resolver: ${JSON.stringify(r5.sinResolver)})`
  );
  check('el motivo dice que no hay token', r5.sinResolver.some((s) => /no tiene token/.test(s.motivo)));
  check('NO lo cierra', r5.expirados.length === 0);

  await limpiar();

  // -------------------------------------------------------------------
  console.log('\n[6] La cola que el operador mira');
  // -------------------------------------------------------------------
  remotoActual = { status: 'INITIATED' };
  const f = await crearPagoAbandonado({ nombre: 'Colgado visible', horasAntiguedad: 9 });

  const cola = await pagosColgados(2);
  check('el pedido colgado aparece en la cola', cola.some((c) => c.orderId === f.pedido.id), `(cola: ${cola.length})`);

  const enCola = cola.find((c) => c.orderId === f.pedido.id);
  check('indica cuantos minutos lleva abierto', (enCola?.minutosAbierto ?? 0) > 120, `(min: ${enCola?.minutosAbierto})`);
  check('incluye la transaccion', Boolean(enCola?.transaccion));

  await limpiar();

  const colaVacia = await pagosColgados(2);
  check('la cola queda vacia al limpiar', colaVacia.length === 0, `(quedan: ${colaVacia.length})`);

  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);
  if (fail > 0) throw new Error(`${fail} prueba(s) de pagos fallaron.`);
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    WebpayPlusService.prototype.getTransactionStatus = statusOriginal;
    await limpiar();
    await prisma.$disconnect();
  });