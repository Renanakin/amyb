/**
 * Reporte de stock: que productos estan bajos y quedan cuantos.
 * Pensado para revisar rapido antes de una demostracion.
 *
 * Ejecutar: npx tsx scripts/stock-report.ts
 */
import { prisma } from '../src/lib/prisma.js';

async function run() {
  const productos = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { stock: 'asc' },
    select: {
      sku: true,
      name: true,
      stock: true,
      minWholesaleQty: true,
      price: true,
      category: true
    }
  });

  const bajos = productos.filter((p) => p.stock < p.minWholesaleQty * 3);
  const agotados = productos.filter((p) => p.stock === 0);

  console.log(`\n=== STOCK ACTUAL (${productos.length} productos activos) ===\n`);

  console.log('CRITICO (no alcanza ni el minimo mayorista):');
  if (agotados.length === 0 && bajos.length === 0) {
    console.log('  (ninguno)\n');
  } else {
    for (const p of [...agotados, ...bajos.filter((b) => !agotados.includes(b))]) {
      const estado = p.stock === 0 ? 'AGOTADO' : 'BAJO';
      console.log(
        `  [${estado.padEnd(7)}] ${p.sku.padEnd(16)} stock ${String(p.stock).padStart(3)} ` +
          `(min ${p.minWholesaleQty})  ${p.name.slice(0, 42)}`
      );
    }
    console.log('');
  }

  console.log('TODOS LOS PRODUCTOS:');
  for (const p of productos) {
    const marca = p.stock < p.minWholesaleQty ? ' <- no vendible' : '';
    console.log(
      `  ${p.sku.padEnd(16)} ${String(p.stock).padStart(4)} un.  min ${String(p.minWholesaleQty).padStart(2)}  ${p.name.slice(0, 45)}${marca}`
    );
  }

  console.log('\nPara reponer el stock de la demostracion:');
  console.log('  Opcion 1: panel admin, campo de stock editable en la tabla');
  console.log('  Opcion 2: npm run db:seed  (repone el catalogo inicial)');
  console.log(`\n  ${agotados.length} agotados, ${bajos.length} bajos.`);
}

run()
  .catch((e) => console.error(e.message))
  .finally(async () => {
    await prisma.$disconnect();
  });
