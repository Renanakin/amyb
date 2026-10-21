/**
 * Purgado de datos de prueba.
 *
 * Las pruebas crean usuarios, pedidos, correos y productos fake que se
 * acumulan: 96 usuarios, 300 pedidos y 250 correos despues de unas
 * cuantas corridas. Contaminan el dashboard y, sobre todo, los numeros
 * que se muestran en los informes.
 *
 * QUEDA:
 *   - Los usuarios reales (admin y clientes demo con correo real).
 *   - Los pedidos de esos clientes reales, con sus correos, sus
 *     transacciones y sus asientos de kardex.
 *   - El catalogo (todo lo que NO sea un producto de prueba).
 *   - El stock en bodega y los asientos del kardex.
 *
 * SOBRE EL KARDEX: no se reescribe la historia. Si al borrar operaciones de
 * prueba el ultimo asiento de un producto deja de cuadrar con el stock
 * real, se registra un movimiento de AJUSTE que explica la diferencia.
 * Borrar asientos seria justo lo que el kardex no puede hacer.
 *
 * Ejecutar en seco (solo informa):  npx tsx scripts/purgar-datos-prueba.ts
 * Ejecutar de verdad:               npx tsx scripts/purgar-datos-prueba.ts --si
 */
import { prisma } from '../src/lib/prisma.js';

const ejecutar = process.argv.includes('--si');

/** Emails que NO son de prueba. Todo lo demas es residuo. */
const USUARIOS_REALES = [
  'admin@amybdistribuidora.cl',
  'camila@gastronomiaandes.cl',
  'factura.demo@correo.cl'
];

async function run() {
  console.log('\n=== PURGADO DE DATOS DE PRUEBA ===\n');

  const usuariosABorrar = await prisma.user.findMany({
    where: { email: { notIn: USUARIOS_REALES } },
    select: { id: true, email: true }
  });
  const idsUsuario = usuariosABorrar.map((u) => u.id);

  // No basta con borrar por userId: la mayoria de los pedidos se crean
  // como invitado, sin sesion, y quedan con userId nulo. SeSelectiona por
  // correo del cliente, que es lo que si esta en todos.
  const pedidosABorrar = await prisma.order.findMany({
    where: { customerEmail: { notIn: USUARIOS_REALES } },
    select: { id: true, orderNumber: true, customerEmail: true }
  });
  const idsPedido = pedidosABorrar.map((p) => p.id);

  const productosABorrar = await prisma.product.findMany({
    where: {
      OR: [
        { sku: { startsWith: 'TEST-' } },
        { sku: { contains: 'TMP-' } },
        { isActive: false, stock: 0 }
      ]
    },
    select: { id: true, sku: true }
  });
  const idsProducto = productosABorrar.map((p) => p.id);

  console.log(`  Usuarios de prueba:    ${usuariosABorrar.length}`);
  console.log(`  Pedidos de prueba:     ${pedidosABorrar.length}`);
  console.log(`  Productos de prueba:   ${productosABorrar.length}`);
  console.log(`\n  Se conservan:`);
  console.log(`    ${USUARIOS_REALES.join(', ')}`);
  console.log(`    Todos los pedidos de esos clientes (incluso los impagos).`);
  console.log(`    El catalogo y los asientos de kardex.\n`);

  if (!ejecutar) {
    console.log('  [dry-run] No se borro nada. Agrega --si para ejecutar.\n');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Orden por dependencias. Los order_items caen en cascada con el
    // pedido; el resto se borra explicito.
    await tx.session.deleteMany({ where: { userId: { in: idsUsuario } } });
    await tx.passwordReset.deleteMany({ where: { userId: { in: idsUsuario } } });
    await tx.address.deleteMany({ where: { userId: { in: idsUsuario } } });
    await tx.cartItem.deleteMany({ where: { OR: [{ userId: { in: idsUsuario } }, { productId: { in: idsProducto } }] } });
    await tx.emailLog.deleteMany({ where: { orderId: { in: idsPedido } } });
    await tx.emailLog.deleteMany({ where: { userId: { in: idsUsuario } } });
    // Correos huerfanos: al borrar un pedido, su order_id queda en NULL
    // (ON DELETE SET NULL) y el correo sobrevive. Son de los mismos
    // clientes de prueba, asi que se van por destinatario.
    await tx.emailLog.deleteMany({
      where: { orderId: null, destinatario: { notIn: USUARIOS_REALES } }
    });
    await tx.webpayTransaction.deleteMany({ where: { orderId: { in: idsPedido } } });
    await tx.stockMovement.deleteMany({ where: { orderId: { in: idsPedido } } });
    await tx.order.deleteMany({ where: { id: { in: idsPedido } } });
    await tx.user.deleteMany({ where: { id: { in: idsUsuario } } });

    await tx.stockMovement.deleteMany({ where: { productId: { in: idsProducto } } });
    await tx.warehouseStock.deleteMany({ where: { productId: { in: idsProducto } } });
    await tx.priceTier.deleteMany({ where: { productId: { in: idsProducto } } });
    await tx.product.deleteMany({ where: { id: { in: idsProducto } } });
  });

  console.log('  Borrado completado.\n');

  // -------------------------------------------------------------------
  // El kardex no se reescribe: se corrige con un asiento nuevo.
  // -------------------------------------------------------------------
  const productos = await prisma.product.findMany({
    select: { id: true, sku: true }
  });

  let ajustes = 0;
  for (const p of productos) {
    const stocks = await prisma.warehouseStock.findMany({
      where: { productId: p.id }
    });
    if (stocks.length === 0) continue;

    const ultimo = await prisma.stockMovement.findFirst({
      where: { productId: p.id },
      orderBy: { createdAt: 'desc' }
    });
    if (!ultimo) continue;

    const real = stocks.reduce((a: number, s: { quantity: number }) => a + s.quantity, 0);
    const diferencia = real - ultimo.balanceAfter;

    if (diferencia === 0) continue;

    const bodegaId = stocks[0].warehouseId;

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          warehouseId: bodegaId,
          productId: p.id,
          type: 'ajuste',
          quantity: diferencia,
          balanceAfter: real,
          reason:
            'Ajuste por purgado de datos de prueba: el saldo del libro no cuadraba ' +
            'con el inventario real tras borrar operaciones de prueba.',
          reference: 'purga-prueba'
        }
      });
    });

    ajustes++;
    console.log(
      `  [AJUSTE] ${p.sku}: libro ${ultimo.balanceAfter} -> real ${real} ` +
        `(${diferencia > 0 ? '+' : ''}${diferencia})`
    );
  }

  console.log(`\n  Ajustes de kardex: ${ajustes}`);
  console.log('\n  Verificacion: npm run stock:verificar\n');
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });