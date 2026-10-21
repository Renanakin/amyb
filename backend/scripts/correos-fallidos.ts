/**
 * Correos que quedaron sin enviar.
 *
 * El caso que recupera: el pago se confirmo pero el aviso al cliente no
 * salio (SMTP caido, proveedor rechazo, corte de red). El pedido queda
 * pagado y el cliente sin saber que cobro ni donde esta su factura. Como
 * el pago ya ocurrio, el correo se puede reenviar en cualquier momento.
 *
 * Ejecutar:              npx tsx scripts/correos-fallidos.ts
 * Solo listar:           npx tsx scripts/correos-fallidos.ts --dry-run
 * Reenviar todo:         npx tsx scripts/correos-fallidos.ts --reenviar
 *
 * El reenvio RECONSTRUYE el correo desde el estado actual del pedido, con
 * el folio y el PDF de ahora, no con el HTML guardado del intento fallido.
 */
import { prisma } from '../src/lib/prisma.js';
import { enviarCorreoDePedido } from '../src/services/notificaciones.js';

const dryRun = process.argv.includes('--dry-run');
const reenviar = process.argv.includes('--reenviar');

async function run() {
  const fallidos = await prisma.emailLog.findMany({
    where: { estado: 'fallido' },
    include: { order: true },
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  console.log(`\n=== CORREOS SIN ENVIAR: ${fallidos.length} ===\n`);

  if (fallidos.length === 0) {
    console.log('  Ninguno. Todos los correos salieron.\n');
    return;
  }

  // Un pedido puede tener varios correos fallidos del mismo tipo. Se
  // reenvia una vez por pedido y tipo: mandar tres veces el mismo aviso
  // solo genera confusion en el cliente.
  const yaAtendidos = new Set<string>();
  let enviados = 0;
  let omitidos = 0;
  let fallidosDeNuevo = 0;

  for (const log of fallidos) {
    const clave = `${log.orderId}:${log.tipo}`;
    const repetido = yaAtendidos.has(clave);
    yaAtendidos.add(clave);

    console.log(
      `  ${log.order?.orderNumber ?? '(sin pedido)'}  ${log.tipo}  -> ${log.destinatario}`
    );
    if (log.error) console.log(`     motivo: ${log.error}`);

    if (!reenviar || log.orderId === null) {
      console.log('     [dry-run] no se reenvio.\n');
      continue;
    }

    if (repetido) {
      console.log('     ya habia otro igual: se omite.\n');
      omitidos++;
      continue;
    }

    const tipo =
      log.tipo === 'factura'
        ? 'factura'
        : log.tipo === 'despacho'
        ? 'despacho'
        : log.tipo === 'entrega'
        ? 'entrega'
        : null;

    if (!tipo) {
      console.log(`     tipo '${log.tipo}' no se reenvia automaticamente.\n`);
      omitidos++;
      continue;
    }

    try {
      const r = await enviarCorreoDePedido(log.orderId, tipo);
      if (r.ok) {
        enviados++;
        console.log(`     [OK] reenviado a ${r.to}\n`);
      } else {
        fallidosDeNuevo++;
        console.log(`     [!!] no se pudo enviar: ${r.message}\n`);
      }
    } catch (e: any) {
      fallidosDeNuevo++;
      console.log(`     [!!] ${e.message}\n`);
    }
  }

  console.log(
    `\n  Resumen: ${enviados} reenviado(s), ${omitidos} omitido(s), ` +
      `${fallidosDeNuevo} sin exito.\n`
  );
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });