/**
 * Reposicion de stock para demostraciones.
 *
 * Las pruebas de pago consumen unidades reales del catalogo. Antes de
 * una demostracion conviene dejar el stock en un nivel que permita
 * vender sin toparse con "insuficiente stock" a mitad del flujo.
 *
 * Ejecutar: npx tsx scripts/reponer-stock.ts [cantidad]
 *          cantidad por defecto: 50
 */
import { prisma } from '../src/lib/prisma.js';

const CANTIDAD = Number(process.argv[2]) || 50;

async function run() {
  console.log(`\n=== REPOSICION DE STOCK a ${CANTIDAD} unidades ===\n`);

  const productos = await prisma.product.findMany({
    where: { isActive: true, sku: { not: { startsWith: 'TEST-' } } }
  });

  for (const p of productos) {
    // Solo repone si quedo bajo: no tocar productos con stock sano
    // respeta la decision de compra del negocio.
    if (p.stock >= CANTIDAD) continue;

    const antes = p.stock;
    await prisma.product.update({
      where: { id: p.id },
      data: { stock: CANTIDAD }
    });

    console.log(`  ${p.sku.padEnd(16)} ${String(antes).padStart(3)} -> ${CANTIDAD}  ${p.name.slice(0, 40)}`);
  }

  const total = await prisma.product.aggregate({
    where: { isActive: true },
    _sum: { stock: true }
  });

  console.log(`\n  Total de unidades en bodega: ${total._sum.stock}\n`);
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
