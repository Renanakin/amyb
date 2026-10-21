/**
 * Pruebas de la asignacion de bodega.
 *
 * La regla que se verifica: la bodega la elige el SISTEMA, nunca el
 * cliente, y no se adivina. Si ninguna bodega puede armar el pedido
 * completo, el pedido se rechaza diciendo que falta; no sale "desde la
 * primera bodega que quede".
 *
 * Necesita la base de datos. Crea sus propias bodegas y las borra al
 * terminar, asi que no toca los datos reales.
 *
 * Ejecutar: npx tsx scripts/test-asignacion-bodega.ts
 */
import { prisma } from '../src/lib/prisma.js';
import {
  elegirBodegaParaPedido,
  disponibleEnBodega
} from '../src/services/inventario.js';

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

const creados = { bodegas: [] as string[], zonas: [] as string[], productos: [] as string[] };

async function crearBodega(sufijo: string, codigo: string) {
  const id = `wh-test-${codigo}-${sufijo}`;
  creados.bodegas.push(id);
  await prisma.warehouse.create({
    data: { id, code: codigo, name: `Bodega prueba ${codigo}`, address: 'Prueba', isActive: true }
  });
  return id;
}

async function crearZona(sufijo: string, id: string, warehouseId: string | null) {
  creados.zonas.push(id);
  await prisma.shippingZone.create({
    data: {
      id,
      name: `Zona prueba ${sufijo}`,
      comuna: 'Temuco',
      cost: 2990,
      estimatedHours: '24h',
      freeShippingThreshold: 35000,
      isActive: true,
      warehouseId
    }
  });
  return id;
}

async function crearProducto(sufijo: string, sku: string) {
  const p = await prisma.product.create({
    data: {
      name: `Producto prueba bodega ${sufijo}`,
      sku,
      category: 'pruebas',
      format: 'Unidad',
      description: 'Creado por test-asignacion-bodega.ts',
      brand: 'Pruebas',
      price: 5000,
      stock: 0,
      minWholesaleQty: 1,
      isActive: false
    }
  });
  creados.productos.push(p.id);
  return p;
}

async function ponerStock(warehouseId: string, productId: string, cantidad: number) {
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    update: { quantity: cantidad },
    create: { warehouseId, productId, quantity: cantidad }
  });
}

async function limpiar() {
  // Los movimientos tienen onDelete: SetNull en el pedido pero no habra
  // ninguno en estas pruebas.
  await prisma.stockMovement.deleteMany({
    where: { warehouseId: { in: creados.bodegas } }
  });
  await prisma.warehouseStock.deleteMany({
    where: { warehouseId: { in: creados.bodegas } }
  });
  await prisma.shippingZone.deleteMany({ where: { id: { in: creados.zonas } } });
  await prisma.warehouse.deleteMany({ where: { id: { in: creados.bodegas } } });
  await prisma.product.deleteMany({ where: { id: { in: creados.productos } } });
}

async function run() {
  const sufijo = Date.now().toString(36).slice(-6);

  console.log('\n=== ASIGNACION DE BODEGA ===\n');

  // -------------------------------------------------------------------
  console.log('[1] Prefiere la bodega que cubre la zona');
  // -------------------------------------------------------------------
  const zonaA = await crearZona(sufijo, `zone-test-a-${sufijo}`, null);
  const bodegaA = await crearBodega(sufijo, `A-${sufijo}`);
  const bodegaB = await crearBodega(sufijo, `B-${sufijo}`);
  await prisma.shippingZone.update({ where: { id: zonaA }, data: { warehouseId: bodegaA } });

  const prod1 = await crearProducto(sufijo, `TST-1-${sufijo}`);
  await ponerStock(bodegaA, prod1.id, 10);
  await ponerStock(bodegaB, prod1.id, 99);

  const r1 = await elegirBodegaParaPedido(zonaA, [{ productId: prod1.id, quantity: 5 }]);
  check('el pedido se puede despachar', r1.ok === true, JSON.stringify(r1.descartadas));
  check('elige la bodega de la zona', r1.warehouseId === bodegaA, `(eligio ${r1.warehouseId})`);
  check('lo dice cuando sirvio desde la zona', r1.seSirvioDesdeLaZona === true);

  // -------------------------------------------------------------------
  console.log('\n[2] Si la de la zona no alcanza, usa otra que si');
  // -------------------------------------------------------------------
  // Una distribuidora de un radio corto: bloquear la venta porque la
  // mercaderia esta a tres cuadras seria peor que despacharla desde ahi.
  await ponerStock(bodegaA, prod1.id, 1);
  await ponerStock(bodegaB, prod1.id, 99);

  const r2 = await elegirBodegaParaPedido(zonaA, [{ productId: prod1.id, quantity: 5 }]);
  check('el pedido se puede despachar igual', r2.ok === true);
  check('cae a la otra bodega', r2.warehouseId === bodegaB, `(eligio ${r2.warehouseId})`);
  check('marca que NO sirvio desde la zona', r2.seSirvioDesdeLaZona === false);
  check(
    'deja registro de por que se descarto la de la zona',
    r2.descartadas.some((d) => d.warehouseId === bodegaA),
    `(descartadas: ${JSON.stringify(r2.descartadas)})`
  );

  // -------------------------------------------------------------------
  console.log('\n[3] Ninguna bodega puede armarlo: se rechaza');
  // -------------------------------------------------------------------
  const prod2 = await crearProducto(sufijo, `TST-2-${sufijo}`);
  await ponerStock(bodegaA, prod2.id, 0);
  await ponerStock(bodegaB, prod2.id, 2);

  const r3 = await elegirBodegaParaPedido(zonaA, [{ productId: prod2.id, quantity: 8 }]);
  check('no asigna bodega', r3.ok === false, `(ok: ${r3.ok})`);
  check('no inventa una bodega', r3.warehouseId === null);
  check(
    'dice cuanto faltaba y cuanto hay',
    r3.faltantes.some((f) => f.productId === prod2.id && f.solicitado === 8 && f.disponible === 2),
    `(faltantes: ${JSON.stringify(r3.faltantes)})`
  );

  // -------------------------------------------------------------------
  console.log('\n[4] Exige que UNA bodega tenga el pedido COMPLETO');
  // -------------------------------------------------------------------
  // Producto 3 solo en A, producto 4 solo en B: ninguna puede armar el
  // pedido entero. Armarlo con stock de dos bodegas significaria despachar
  // desde dos lugares, que es una operacion que no existe.
  const prod3 = await crearProducto(sufijo, `TST-3-${sufijo}`);
  const prod4 = await crearProducto(sufijo, `TST-4-${sufijo}`);
  await ponerStock(bodegaA, prod3.id, 50);
  await ponerStock(bodegaB, prod4.id, 50);

  const r4 = await elegirBodegaParaPedido(zonaA, [
    { productId: prod3.id, quantity: 2 },
    { productId: prod4.id, quantity: 2 }
  ]);
  check('rechaza el pedido partido entre dos bodegas', r4.ok === false, `(ok: ${r4.ok})`);
  check(
    'explica que ninguna bodega tiene el pedido completo',
    // Se consideran TODAS las bodegas activas del negocio, no solo las de
    // esta prueba: la de la zona y la otra quedan descartadas, y puede
    // haber mas.
    r4.descartadas.some((d) => d.warehouseId === bodegaA) &&
      r4.descartadas.some((d) => d.warehouseId === bodegaB),
    `(descartadas: ${JSON.stringify(r4.descartadas)})`
  );

  // -------------------------------------------------------------------
  console.log('\n[5] La unidad reservada NO se promete');
  // -------------------------------------------------------------------
  await ponerStock(bodegaA, prod3.id, 10);
  await prisma.warehouseStock.update({
    where: { warehouseId_productId: { warehouseId: bodegaA, productId: prod3.id } },
    data: { reserved: 8 }
  });

  check(
    'la disponibilidad descuenta lo reservado',
    (await disponibleEnBodega(bodegaA, prod3.id)) === 2,
    `(disponible: ${await disponibleEnBodega(bodegaA, prod3.id)})`
  );

  const r5 = await elegirBodegaParaPedido(zonaA, [{ productId: prod3.id, quantity: 5 }]);
  check('no promete stock que ya esta comprometido', r5.ok === false, `(ok: ${r5.ok})`);

  // -------------------------------------------------------------------
  console.log('\n[6] Producto sin fila de stock en ninguna bodega');
  // -------------------------------------------------------------------
  const prod5 = await crearProducto(sufijo, `TST-5-${sufijo}`);

  const r6 = await elegirBodegaParaPedido(zonaA, [{ productId: prod5.id, quantity: 1 }]);
  check('no lo inventa', r6.ok === false);
  check('lo reporta como faltante con 0 disponibles', r6.faltantes.some((f) => f.productId === prod5.id && f.disponible === 0), `(faltantes: ${JSON.stringify(r6.faltantes)})`);

  await limpiar();
  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);

  if (fail > 0) throw new Error(`${fail} prueba(s) de asignacion fallaron.`);
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });