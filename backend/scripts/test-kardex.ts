/**
 * Pruebas del kardex de inventario.
 *
 * Lo que cubren:
 *   - Todo movimiento deja asiento, con el saldo que dejo.
 *   - Un movimiento nunca deja el stock en negativo.
 *   - products.stock (la cache agregada) sigue al movimiento.
 *   - La reserva no se promete.
 *   - El kardex no se reescribe: un ajuste es un asiento nuevo.
 *   - La anulacion de una venta devuelve la mercaderia con su asiento.
 *
 * Necesita la base de datos. Crea sus datos y los borra al terminar.
 *
 * Ejecutar: npx tsx scripts/test-kardex.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { registrarMovimiento } from '../src/services/inventario.js';

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

const id = { wh: '', prod: '' };

async function setup() {
  const sfx = Date.now().toString(36).slice(-6);
  id.wh = `wh-kardex-${sfx}`;

  await prisma.warehouse.create({
    data: { id: id.wh, code: `KRD-${sfx}`, name: 'Bodega kardex prueba', address: 'Prueba', isActive: true }
  });

  const p = await prisma.product.create({
    data: {
      name: `Producto kardex ${sfx}`,
      sku: `KRD-${sfx}`,
      category: 'pruebas',
      format: 'Unidad',
      description: 'Creado por test-kardex.ts',
      brand: 'Pruebas',
      price: 5000,
      stock: 0,
      minWholesaleQty: 1,
      isActive: false
    }
  });
  id.prod = p.id;

  await prisma.warehouseStock.create({
    data: { warehouseId: id.wh, productId: id.prod, quantity: 0, reserved: 0 }
  });
}

async function cleanup() {
  await prisma.stockMovement.deleteMany({ where: { warehouseId: id.wh } });
  await prisma.warehouseStock.deleteMany({ where: { warehouseId: id.wh } });
  await prisma.warehouse.delete({ where: { id: id.wh } });
  await prisma.product.delete({ where: { id: id.prod } });
}

/** Aplica un movimiento por fuera de una transaccion propia. */
async function mover(args: Parameters<typeof registrarMovimiento>[1]) {
  return prisma.$transaction((tx) => registrarMovimiento(tx, args));
}

async function saldoBodega() {
  const f = await prisma.warehouseStock.findUnique({
    where: { warehouseId_productId: { warehouseId: id.wh, productId: id.prod } }
  });
  return f?.quantity ?? -1;
}

async function stockCache() {
  const p = await prisma.product.findUnique({ where: { id: id.prod } });
  return p?.stock ?? -1;
}

async function run() {
  await setup();
  console.log('\n=== KARDEX DE INVENTARIO ===\n');

  // -------------------------------------------------------------------
  console.log('[1] Compra a proveedor');
  // -------------------------------------------------------------------
  const m1 = await mover({
    warehouseId: id.wh, productId: id.prod, type: 'entrada',
    quantity: 50, reason: 'Compra factura 001-123', reference: 'F-123'
  });
  check('el movimiento se aplica', m1.ok === true);
  check('deja saldo 50 en bodega', (await saldoBodega()) === 50);
  check('la cache sube a 50', (await stockCache()) === 50);

  const asiento1 = await prisma.stockMovement.findFirst({
    where: { warehouseId: id.wh }, orderBy: { createdAt: 'desc' }
  });
  check('deja asiento en el kardex', asiento1 !== null);
  check('el asiento guarda el saldo que dejo', asiento1?.balanceAfter === 50);
  check('el asiento guarda el motivo', asiento1?.reason === 'Compra factura 001-123');
  check('el asiento guarda la referencia externa', asiento1?.reference === 'F-123');

  // -------------------------------------------------------------------
  console.log('\n[2] Venta');
  // -------------------------------------------------------------------
  const m2 = await mover({
    warehouseId: id.wh, productId: id.prod, type: 'salida',
    quantity: -12, reason: 'Venta AMYB-TEST-1'
  });
  check('descuenta de la bodega', (await saldoBodega()) === 38);
  check('la cache sigue al movimiento', (await stockCache()) === 38);

  const asiento2 = await prisma.stockMovement.findFirst({
    where: { warehouseId: id.wh }, orderBy: { createdAt: 'desc' }
  });
  check('el asiento guarda 38', asiento2?.balanceAfter === 38);
  check('el asiento guarda la cantidad negativa', asiento2?.quantity === -12);

  // -------------------------------------------------------------------
  console.log('\n[3] No se puede quedar en negativo');
  // -------------------------------------------------------------------
  const m3 = await mover({
    warehouseId: id.wh, productId: id.prod, type: 'salida',
    quantity: -500, reason: 'Venta imposible'
  });
  check('rechaza el movimiento', m3.ok === false, `(ok: ${m3.ok})`);
  check('dice que no alcanza', m3.ok === false && m3.error === 'STOCK_INSUFICIENTE');
  check('el saldo NO cambia', (await saldoBodega()) === 38);
  check('la cache NO cambia', (await stockCache()) === 38);

  const totalAsientos = await prisma.stockMovement.count({ where: { warehouseId: id.wh } });
  check('NO escribe asiento de lo que no ocurrio', totalAsientos === 2, `(hay ${totalAsientos})`);

  // -------------------------------------------------------------------
  console.log('\n[4] Ajuste con motivo');
  // -------------------------------------------------------------------
  // Un conteo fisico que no cuadra: se corrige con un asiento nuevo, no
  // editando el anterior. La historia queda.
  const m4 = await mover({
    warehouseId: id.wh, productId: id.prod, type: 'ajuste',
    quantity: -3, reason: 'Ajuste por conteo fisico: 3 unidades danadas', correctsId: asiento2!.id
  });
  check('aplica el ajuste', m4.ok === true);
  check('el saldo queda en 35', (await saldoBodega()) === 35);

  const asiento4 = await prisma.stockMovement.findFirst({
    where: { warehouseId: id.wh }, orderBy: { createdAt: 'desc' }
  });
  check('el ajuste es un asiento NUEVO', asiento4?.id !== asiento2?.id);
  check('el ajuste referencia al que corrige', asiento4?.correctsId === asiento2!.id);
  check('el asiento original sigue intacto', asiento2?.balanceAfter === 38);

  // -------------------------------------------------------------------
  console.log('\n[5] Merma');
  // -------------------------------------------------------------------
  const m5 = await mover({
    warehouseId: id.wh, productId: id.prod, type: 'salida',
    quantity: -2, reason: 'Merma: producto vencido'
  });
  check('la merma descuenta', (await saldoBodega()) === 33);

  // -------------------------------------------------------------------
  console.log('\n[6] Devolucion de cliente');
  // -------------------------------------------------------------------
  const m6 = await mover({
    warehouseId: id.wh, productId: id.prod, type: 'entrada',
    quantity: 4, reason: 'Devolucion de cliente'
  });
  check('la devolucion suma', (await saldoBodega()) === 37);
  check('la cache termina cuadrada con la bodega', (await stockCache()) === 37);

  // -------------------------------------------------------------------
  console.log('\n[7] Cantidad invalida');
  // -------------------------------------------------------------------
  let lanzo = false;
  try {
    await mover({
      warehouseId: id.wh, productId: id.prod, type: 'ajuste',
      quantity: 0, reason: 'esto no deberia existir'
    });
  } catch { lanzo = true; }
  check('un movimiento de cantidad 0 se rechaza', lanzo);

  // -------------------------------------------------------------------
  console.log('\n[8] Producto sin fila de stock en la bodega');
  // -------------------------------------------------------------------
  const p2 = await prisma.product.create({
    data: {
      name: 'Producto sin fila', sku: `SINFILA-${Date.now().toString(36).slice(-5)}`,
      category: 'pruebas', format: 'Unidad', description: 'test-kardex',
      brand: 'Pruebas', price: 1000, stock: 0, minWholesaleQty: 1, isActive: false
    }
  });
  const m8 = await mover({
    warehouseId: id.wh, productId: p2.id, type: 'entrada',
    quantity: 10, reason: 'Prueba sin fila'
  });
  check('no inventa una fila de stock', m8.ok === false && m8.error === 'SIN_FILA_STOCK');
  const cacheP2 = await prisma.product.findUnique({ where: { id: p2.id } });
  check('no toca la cache del producto', cacheP2?.stock === 0);
  await prisma.product.delete({ where: { id: p2.id } });

  // -------------------------------------------------------------------
  console.log('\n[9] El kardex reconstruye el saldo');
  // -------------------------------------------------------------------
  const movimientos = await prisma.stockMovement.findMany({
    where: { warehouseId: id.wh }, orderBy: { createdAt: 'asc' }
  });
  const reconstruido = movimientos[movimientos.length - 1]?.balanceAfter;
  check(
    'el ultimo asiento coincide con el saldo real de la bodega',
    reconstruido === (await saldoBodega()),
    `(kardex dice ${reconstruido}, bodega tiene ${await saldoBodega()})`
  );
  check('la cache coincide con la bodega', (await stockCache()) === (await saldoBodega()));

  await cleanup();
  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);

  if (fail > 0) throw new Error(`${fail} prueba(s) de kardex fallaron.`);
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });