/**
 * Verificacion del stock agregado.
 *
 * products.stock NO es la fuente de verdad: lo es la suma de
 * warehouse_stocks. Se mantiene como cache porque una decena de lugares
 * lo leen (carrito, checkout, webpay, panel) y sumar en cada lectura es
 * una consulta de mas en el camino caliente.
 *
 * Una cache puede desviarse. Este script la recalcula y reporta la
 * diferencia, que deberia ser SIEMPRE cero. Es la misma idea que la
 * reconciliacion de pagos: una cache mas un chequeo que avise cuando se
 * rompe, en vez de una cache en la que hay que confiar.
 *
 * Ejecutar: npx tsx scripts/stock-verificar.ts
 * Corregir: npx tsx scripts/stock-verificar.ts --corregir
 */
import { prisma } from '../src/lib/prisma.js';

const corregir = process.argv.includes('--corregir');

async function run() {
  console.log('\n=== VERIFICACION DE STOCK AGREGADO ===\n');

  const productos = await prisma.product.findMany({
    select: { id: true, sku: true, name: true, stock: true }
  });

  const agregados = await prisma.warehouseStock.groupBy({
    by: ['productId'],
    _sum: { quantity: true }
  });

  const porProducto = new Map(
    agregados.map((a) => [a.productId, a._sum.quantity ?? 0])
  );

  const discrepancias: Array<{
    sku: string;
    name: string;
    cache: number;
    real: number;
  }> = [];

  for (const p of productos) {
    const real = porProducto.get(p.id) ?? 0;
    if (real !== p.stock) {
      discrepancias.push({ sku: p.sku, name: p.name, cache: p.stock, real });
    }
  }

  const totalCache = productos.reduce((a, p) => a + p.stock, 0);
  const totalReal = agregados.reduce((a, x) => a + (x._sum.quantity ?? 0), 0);

  console.log(`  Productos revisados: ${productos.length}`);
  console.log(`  Total en products.stock (cache): ${totalCache}`);
  console.log(`  Total en warehouse_stocks (real): ${totalReal}`);
  console.log(`  Discrepancias: ${discrepancias.length}\n`);

  if (discrepancias.length === 0) {
    console.log('  [OK] La cache coincide con el stock real.\n');
    return;
  }

  for (const d of discrepancias) {
    const delta = d.real - d.cache;
    console.log(
      `  ${d.sku.padEnd(16)} ${d.name.substring(0, 34).padEnd(34)} ` +
        `cache ${d.cache}  real ${d.real}  (${delta > 0 ? '+' : ''}${delta})`
    );
  }

  if (corregir) {
    console.log('\n  Corrigiendo products.stock con el valor real...');
    for (const d of discrepancias) {
      const p = productos.find((x) => x.sku === d.sku)!;
      await prisma.product.update({ where: { id: p.id }, data: { stock: d.real } });
    }
    console.log(`  ${discrepancias.length} producto(s) corregido(s).`);
    console.log(
      '\n  Ojo: corregir la cache NO deja rastro. Si la diferencia viene de un\n' +
        '  movimiento que nunca se escribio, hay que investigar la causa con\n' +
        '  npm run stock:kardex antes de aceptar el numero.\n'
    );
  } else {
    console.log('\n  Para alinear la cache: npm run stock:verificar -- --corregir\n');
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