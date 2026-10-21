/**
 * Limpieza de datos de prueba.
 *
 * Las suites automaticas crean productos, pedidos y usuarios con
 * prefijo TEST- o correos de prueba. Mezclados con el catalogo real
 * ensucian la tienda y confunden en una demostracion.
 *
 * Ejecutar: npx tsx scripts/limpiar-pruebas.ts
 */
import { prisma } from '../src/lib/prisma.js';

async function run() {
  console.log('\n=== LIMPIEZA DE DATOS DE PRUEBA ===\n');

  // 1) Productos de prueba (creados por test-admin y test-estados)
  const productosTest = await prisma.product.findMany({
    where: {
      OR: [{ sku: { startsWith: 'TEST-' } }, { sku: { startsWith: 'HACK-' } }]
    },
    select: { id: true, sku: true }
  });

  if (productosTest.length > 0) {
    // Los carritos se borran en cascada; los pedidos se conservan como
    // historico pero sin el producto colgado.
    await prisma.cartItem.deleteMany({
      where: { productId: { in: productosTest.map((p) => p.id) } }
    });
    await prisma.orderItem.deleteMany({
      where: { productId: { in: productosTest.map((p) => p.id) } }
    });
    await prisma.priceTier.deleteMany({
      where: { productId: { in: productosTest.map((p) => p.id) } }
    });
    await prisma.product.deleteMany({
      where: { id: { in: productosTest.map((p) => p.id) } }
    });
    console.log(`  Productos de prueba eliminados: ${productosTest.length}`);
  } else {
    console.log('  Sin productos de prueba.');
  }

  // 2) Usuarios de prueba (menos el admin real)
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@amybdistribuidora.cl').toLowerCase();
  const usuariosTest = await prisma.user.findMany({
    where: {
      AND: [
        { email: { not: adminEmail } },
        {
          OR: [
            { email: { contains: 'test.' } },
            { email: { contains: 'prueba.' } },
            { email: { contains: 'presentacion.' } },
            { email: { contains: 'rechazo.' } },
            { email: { contains: 'correo.' } },
            { email: { contains: 'fix.' } },
            { email: { contains: '@gastron.cl' } },
            { email: { endsWith: '@amyb.cl' } }
          ]
        }
      ]
    },
    select: { id: true, email: true }
  });

  if (usuariosTest.length > 0) {
    await prisma.session.deleteMany({
      where: { userId: { in: usuariosTest.map((u) => u.id) } }
    });
    await prisma.cartItem.deleteMany({
      where: { userId: { in: usuariosTest.map((u) => u.id) } }
    });
    await prisma.user.deleteMany({
      where: { id: { in: usuariosTest.map((u) => u.id) } }
    });
    console.log(`  Usuarios de prueba eliminados: ${usuariosTest.length}`);
  } else {
    console.log('  Sin usuarios de prueba.');
  }

  // 3) Pedidos de prueba (los que locomaron a productos de prueba)
  const pedidosTest = await prisma.order.findMany({
    where: {
      OR: [
        { customerNombre: { contains: 'Test' } },
        { customerNombre: { contains: 'Prueba' } },
        { customerEmail: { contains: '@amyb.cl' } }
      ]
    },
    select: { id: true }
  });

  if (pedidosTest.length > 0) {
    await prisma.webpayTransaction.deleteMany({
      where: { orderId: { in: pedidosTest.map((p) => p.id) } }
    });
    await prisma.emailLog.deleteMany({
      where: { orderId: { in: pedidosTest.map((p) => p.id) } }
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: pedidosTest.map((p) => p.id) } }
    });
    await prisma.order.deleteMany({
      where: { id: { in: pedidosTest.map((p) => p.id) } }
    });
    console.log(`  Pedidos de prueba eliminados: ${pedidosTest.length}`);
  } else {
    console.log('  Sin pedidos de prueba.');
  }

  // 4) Transacciones Webpay huerfanas de esas pruebas
  const huerfanas = await prisma.webpayTransaction.count({
    where: { buyOrder: { startsWith: 'AMYB-' } }
  });
  console.log(`  Transacciones Webpay restantes: ${huerfanas}`);

  // 5) Emails de prueba sin pedido
  const correosHuerfanos = await prisma.emailLog.deleteMany({
    where: { orderId: null }
  });
  console.log(`  Correos de prueba huérfanos eliminados: ${correosHuerfanos.count}`);

  // Estado final
  const productos = await prisma.product.count({ where: { isActive: true } });
  const usuarios = await prisma.user.count();
  const pedidos = await prisma.order.count();

  console.log(`\n  Estado final: ${productos} productos, ${usuarios} usuarios, ${pedidos} pedidos.`);
  console.log('  Admin conservado:', adminEmail, '\n');
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
