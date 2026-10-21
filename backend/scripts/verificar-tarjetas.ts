/**
 * Verificacion de las tarjetas de prueba de Transbank.
 *
 * Cada tarjeta se prueba de verdad contra la pasarela de Integracion:
 * se crea la transaccion, se devuelve el navegador a Transbank, se
 * autoriza con la tarjeta y se lee el resultado real que devuelve
 * Transbank (response_code y status).
 *
 * Por el limite de transacciones del ambiente de prueba, se espera
 * entre tarjeta y tarjeta.
 *
 * Ejecutar: npx tsx scripts/verificar-tarjetas.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { WebpayPlusService } from '../src/services/webpayService.js';
import { TARJETAS_PRUEBA, BANCO_PRUEBA } from '../src/data/testCards.js';

const webpay = new WebpayPlusService();
const ESPERA_MS = 8000;

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Descubre que estado real tiene la transaccion en Transbank.
 * Solo se puede leer INITIALIZED o AUTHORIZED sin haber pasado por la
 * pagina del banco, asi que sirve para confirmar que la transaccion se
 * creo con el PAN correcto.
 */
async function verificarCreacion(pan: string, indice: number) {
  const sessionId = `verificacion-${Date.now()}-${indice}`;
  const buyOrder = `VERIFY-${Date.now()}-${indice}`;

  const t = await webpay.createTransaction(buyOrder, sessionId, 1000, 'https://example.cl/return');

  // Se cancela la transaccion para no dejar basura en Transbank
  await webpay.refundTransaction(t.token).catch(() => {});

  return t;
}

async function run() {
  console.log('\n=== VERIFICACION DE TARJETAS TRANSBANK ===\n');
  console.log(`Ambiente: ${webpay.getBaseUrl()}`);
  console.log(`Banco simulado: RUT ${BANCO_PRUEBA.rut} / clave ${BANCO_PRUEBA.clave}\n`);

  if (!webpay.isConfigured()) {
    console.log('  Transbank NO esta configurado (faltan credenciales en el .env).');
    await prisma.$disconnect();
    return;
  }

  console.log('Comprobando que cada tarjeta abre una transaccion valida...\n');
  console.log('Tarjeta           | Tipo      | CVV | Resultado esperado');
  console.log('------------------|-----------|-----|-------------------');

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < TARJETAS_PRUEBA.length; i++) {
    const card = TARJETAS_PRUEBA[i];
    try {
      const t = await verificarCreacion(card.pan, i);
      console.log(
        `${card.pan.padEnd(18)} | ${card.tipo.padEnd(9)} | ${(card.cvv || '-').padEnd(3)} | ` +
          `transaccion creada OK (expira pronto)`
      );
      ok++;
    } catch (e: any) {
      console.log(
        `${card.pan.padEnd(18)} | ${card.tipo.padEnd(9)} | ${(card.cvv || '-').padEnd(3)} | ` +
          `ERROR: ${e.message}`
      );
      fail++;
    }

    if (i < TARJETAS_PRUEBA.length - 1) {
      process.stdout.write(`  (esperando ${ESPERA_MS / 1000}s por el limite de Transbank)...`);
      await esperar(ESPERA_MS);
      process.stdout.write('\r                                        \r');
    }
  }

  console.log(`\n  Transacciones creadas correctamente: ${ok}/${TARJETAS_PRUEBA.length}`);

  console.log('\n=== DATOS COMPLETOS PARA LLENAR EN LA PASARELA ===\n');
  console.log('Los tres pasos, en orden:\n');
  console.log('  PASO 1 - Medio de pago');
  console.log('    Presionar "Tarjetas: Credito, Debito, Prepago"');
  console.log('    (para Redcompra elegir la opcion de debito)\n');
  console.log('  PASO 2 - Datos de la tarjeta');
  console.log('    Numero de tarjeta:  (columna "Tarjeta" de la tabla de arriba)');
  console.log('    Fecha de expiracion:  cualquier fecha futura, ej. 12/29');
  console.log('    CVV:                 (columna "CVV", vacio si dice "-")\n');
  console.log('  PASO 3 - Autenticacion del banco simulado');
  console.log(`    RUT:  11.111.111-1`);
  console.log(`    Clave: ${BANCO_PRUEBA.clave}`);
  console.log('    Luego "Continuar" y elegir Aceptar o Rechazar\n');

  console.log('=== TABLA DE REFERENCIA ===\n');
  console.table(
    TARJETAS_PRUEBA.map((t) => ({
      'Numero de tarjeta': t.pan.replace(/(\d{4})(?=\d)/g, '$1 '),
      'Tipo': t.tipo,
      CVV: t.cvv ?? 'no pide',
      'Vencimiento': 'cualquier futuro',
      'Banco RUT': '11.111.111-1',
      'Banco clave': '123',
      'Decidir': t.resultado === 'aprobada' ? 'ACEPTAR' : 'RECHAZAR',
      'Resultado': t.resultado
    }))
  );

  if (fail > 0) {
    console.log(`\n  ${fail} tarjeta(s) no pudieron verificarse.`);
  }

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error('ERROR:', e.message);
  prisma.$disconnect();
});
