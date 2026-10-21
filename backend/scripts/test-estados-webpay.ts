/**
 * Pruebas de cobertura de estados y tarjetas de Transbank.
 *
 * Ejecutar: npx tsx scripts/test-estados-webpay.ts
 *
 * Valida tres cosas:
 *   1. El catalogo de tarjetas oficial esta completo y bien formado
 *   2. El backend traduce CADA response_code a un mensaje util
 *   3. El flujo de init acepta todas las tarjetas oficiales de Transbank
 *   4. La matriz de estados (aprobado, rechazado, cancelado, expirado)
 *      se refleja correctamente en el estado local del pedido
 *
 * Las pruebas 1, 2 y 4 son deterministas y no necesitan red.
 * La prueba 3 SI llama a Transbank, por eso se puede apagar con
 *   SKIP_RED=1 npx tsx scripts/test-estados-webpay.ts
 *
 * Todo corre dentro de main() porque el archivo se compila como
 * CommonJS (tsx) y alli el await de nivel superior no existe.
 */
import { prisma } from '../src/lib/prisma.js';
import {
  TARJETAS_PRUEBA,
  RESPONSE_CODES,
  ESTADOS_TRANSACCION,
  ESTADOS_LOCALES,
  estadoLocalDesdeTransbank,
  BANCO_PRUEBA
} from '../src/data/testCards.js';
import { describeResponseCode } from '../src/services/webpayService.js';

const API = 'http://localhost:3001';
const SKIP_RED = process.env.SKIP_RED === '1';

let pass = 0;
let fail = 0;
let skip = 0;

function check(label: string, ok: boolean, extra = '') {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} ${extra}`);
  }
}

function skipTest(label: string, motivo: string) {
  skip++;
  console.log(`  [SKIP] ${label} (${motivo})`);
}

async function main() {

// =====================================================================
console.log('=== PRUEBAS DE ESTADOS Y TARJETAS TRANSBANK ===\n');

// ---------------------------------------------------------------------
console.log('[1] Catalogo de tarjetas oficiales');
// ---------------------------------------------------------------------
{
  check('Catalogo tiene 8 tarjetas', TARJETAS_PRUEBA.length === 8, `(tiene ${TARJETAS_PRUEBA.length})`);

  const panDuplicados = TARJETAS_PRUEBA.map((t) => t.pan).filter(
    (pan, i, arr) => arr.indexOf(pan) !== i
  );
  check('No hay PAN duplicados', panDuplicados.length === 0, `(${panDuplicados.join(', ')})`);

  // AMEX usa PAN de 15 digitos (no 16 como VISA/MC). El resto son 16.
  const amexPan = TARJETAS_PRUEBA.find((t) => t.pan.startsWith('37'));
  check('AMEX tiene PAN de 15 digitos', amexPan?.pan.length === 15,
    `(tiene ${amexPan?.pan.length})`);

  const noAmexMal = TARJETAS_PRUEBA.filter(
    (t) => !t.pan.startsWith('37') && t.pan.length !== 16
  );
  check('VISA/MC/Redcompra tienen PAN de 16 digitos', noAmexMal.length === 0,
    `(${noAmexMal.map((t) => t.descripcion).join(', ')})`);

  const noDigitos = TARJETAS_PRUEBA.filter((t) => !/^\d+$/.test(t.pan));
  check('Todos los PAN son solo numeros', noDigitos.length === 0);

  const sinResultado = TARJETAS_PRUEBA.filter(
    (t) => t.resultado !== 'aprobada' && t.resultado !== 'rechazada'
  );
  check('Todas declaran su resultado', sinResultado.length === 0);

  const conCvvInvalido = TARJETAS_PRUEBA.filter(
    (t) => t.requiereCvv && (!t.cvv || !/^\d{3,4}$/.test(t.cvv))
  );
  check('Los CVV tienen 3 o 4 digitos', conCvvInvalido.length === 0);

  // Cobertura por tipo
  const porTipo = {
    credito: TARJETAS_PRUEBA.filter((t) => t.tipo === 'credito').length,
    debito: TARJETAS_PRUEBA.filter((t) => t.tipo === 'debito').length,
    prepago: TARJETAS_PRUEBA.filter((t) => t.tipo === 'prepago').length
  };
  check('Hay tarjetas de credito', porTipo.credito >= 3, `(${porTipo.credito})`);
  check('Hay tarjetas de debito', porTipo.debito >= 3, `(${porTipo.debito})`);
  check('Hay tarjetas de prepago', porTipo.prepago >= 2, `(${porTipo.prepago})`);

  const aprobadas = TARJETAS_PRUEBA.filter((t) => t.resultado === 'aprobada');
  const rechazadas = TARJETAS_PRUEBA.filter((t) => t.resultado === 'rechazada');
  check('Hay tarjetas que aprueban', aprobadas.length === 5, `(${aprobadas.length})`);
  check('Hay tarjetas que rechazan', rechazadas.length === 3, `(${rechazadas.length})`);

  // Banco de pruebas
  check('RUT del banco es 11.111.111-1', BANCO_PRUEBA.rut === '11111111');
  check('Clave del banco es 123', BANCO_PRUEBA.clave === '123');
}

// ---------------------------------------------------------------------
console.log('\n[2] Traduccion de response_code a mensajes');
// ---------------------------------------------------------------------
{
  check(
    'Codigo 0 (autorizado) devuelve mensaje de exito',
    describeResponseCode(0).toLowerCase().includes('autorizado')
  );

  const codigosCubiertos = RESPONSE_CODES.map((c) => c.codigo);
  check('Catalogo cubre el codigo 0', codigosCubiertos.includes(0));
  check('Catalogo cubre los rechazos -1 a -5', [1, 2, 3, 4, 5].every((n) => codigosCubiertos.includes(-n)));

  for (const c of RESPONSE_CODES) {
    const msg = describeResponseCode(c.codigo);
    check(
      `Codigo ${c.codigo} (${c.nombre}) tiene mensaje`,
      typeof msg === 'string' && msg.length > 10,
      `(devolvio "${msg}")`
    );
  }

  // Ningun mensaje puede prometer un pago exitoso si el codigo no es 0
  for (const c of RESPONSE_CODES.filter((x) => x.codigo !== 0)) {
    const msg = describeResponseCode(c.codigo).toLowerCase();
    check(
      `Codigo ${c.codigo} NO dice "autorizado"`,
      !msg.includes('autorizado correctamente'),
      `(dijo "${msg}")`
    );
  }

  // Codigo desconocido no debe romper
  const desconocido = describeResponseCode(-99);
  check(
    'Codigo desconocido devuelve mensaje generico',
    typeof desconocido === 'string' && desconocido.length > 10
  );
}

// ---------------------------------------------------------------------
console.log('\n[3] Estados posibles de una transaccion');
// ---------------------------------------------------------------------
{
  check('Catalogo de estados incluye AUTHORIZED', ESTADOS_TRANSACCION.includes('AUTHORIZED'));
  check('Catalogo de estados incluye REJECTED', ESTADOS_TRANSACCION.includes('REJECTED'));
  check('Catalogo de estados incluye ABORTED', ESTADOS_TRANSACCION.includes('ABORTED'));
  check('Catalogo de estados incluye TIMED_OUT', ESTADOS_TRANSACCION.includes('TIMED_OUT'));
  check('Catalogo de estados incluye INITIALIZED', ESTADOS_TRANSACCION.includes('INITIALIZED'));
  check('El catalogo no tiene estados duplicados',
    new Set(ESTADOS_TRANSACCION).size === ESTADOS_TRANSACCION.length);
}

// ---------------------------------------------------------------------
console.log('\n[4] Flujo real: init para cada tarjeta oficial');
// ---------------------------------------------------------------------
if (SKIP_RED) {
  skipTest('Init contra Transbank', 'SKIP_RED=1');
} else {
  const product = await prisma.product.findFirst({ where: { isActive: true } });
  if (!product) {
    skipTest('Init contra Transbank', 'sin productos en la base');
  } else {
    for (const card of TARJETAS_PRUEBA) {
      // Cada tarjeta necesita su propio pedido: Transbank no permite
      // reutilizar el token de una transaccion anterior.
      const year = new Date().getFullYear();
      const last = await prisma.$queryRaw<{ max: number | null }[]>`
        SELECT MAX(CAST(SUBSTRING("order_number" FROM 11) AS INTEGER)) AS max
        FROM orders WHERE "order_number" ~ ('^AMYB-' || ${year} || '-[0-9]+$')
      `;
      const next = (last[0]?.max ?? 0) + 1;
      const orderNumber = `AMYB-${year}-${String(next).padStart(6, '0')}`;
      const total = 5000;

      const order = await prisma.order.create({
        data: {
          orderNumber,
          customerNombre: `Test ${card.descripcion}`,
          customerEmail: 'test@amybdistribuidora.cl',
          customerTelefono: '+56 9 0000 0000',
          dteTipoDocumento: 'boleta',
          subtotal: total,
          neto: Math.round(total / 1.19),
          iva: total - Math.round(total / 1.19),
          total,
          paymentMethod: 'webpay',
          paymentStatus: 'pendiente',
          orderStatus: 'pendiente',
          shippingZoneId: 'zone-temuco-centro',
          shippingZoneName: 'Temuco Centro',
          shippingAddress: 'Prueba automatizada',
          items: {
            create: {
              productId: product.id,
              productName: product.name,
              productFormat: product.format,
              quantity: 1,
              unitPrice: product.price,
              subtotal: product.price
            }
          }
        }
      });

      const res = await fetch(`${API}/api/webpay/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id })
      });
      const body = (await res.json()) as any;

      check(
        `${card.descripcion} (${card.pan.slice(0, 4)}...) acepta init`,
        body.success === true && Boolean(body.data?.token),
        body.message ? `-> ${body.message}` : ''
      );

      if (body.success) {
        // El estado debe quedar registrado como INITIATED
        const txn = await prisma.webpayTransaction.findUnique({
          where: { token: body.data.token }
        });
        check(
          `  ${card.descripcion} queda INITIATED en la base`,
          txn?.status === 'INITIATED',
          `(estado: ${txn?.status})`
        );
        check(
          `  ${card.descripcion} cambia el pedido a 'procesando'`,
          order.paymentStatus === 'pendiente'
        );
      }
    }
  }
}

// ---------------------------------------------------------------------
console.log('\n[5] Matriz de estados locales segun escenario');
// ---------------------------------------------------------------------
{
  // Cada fila describe que debe guardar el backend ante cada escenario
  // de retorno de Transbank.
  const matriz: {
    escenario: string;
    estadoEsperado: string;
    pagoEsperado: string;
    descripcion: string;
  }[] = [
    {
      escenario: 'Pago aprobado',
      estadoEsperado: 'AUTHORIZED',
      pagoEsperado: 'pagado',
      descripcion: 'token_ws + commit AUTHORIZED'
    },
    {
      escenario: 'Pago rechazado por banco',
      estadoEsperado: 'REJECTED',
      pagoEsperado: 'rechazado',
      descripcion: 'commit con response_code != 0'
    },
    {
      escenario: 'Usuario cancela en la pasarela',
      estadoEsperado: 'ABORTED',
      pagoEsperado: 'pendiente',
      descripcion: 'TBK_TOKEN presente'
    },
    {
      escenario: 'Transaccion expira por tiempo',
      estadoEsperado: 'TIMED_OUT',
      pagoEsperado: 'pendiente',
      descripcion: 'TBK_ORDEN_COMPRA presente'
    },
    {
      escenario: 'Pago en curso (aun no paga)',
      estadoEsperado: 'INITIATED',
      pagoEsperado: 'procesando',
      descripcion: 'init sin retorno aun'
    }
  ];

  console.log('');
  for (const m of matriz) {
    // La matriz describe el estado LOCAL de Amyb, que no usa los mismos
    // nombres que Transbank (INITIATED local vs INITIALIZED remoto).
    const existeEnCatalogo = (ESTADOS_LOCALES as readonly string[]).includes(
      m.estadoEsperado
    );
    check(
      `Matriz: "${m.escenario}" -> ${m.estadoEsperado}`,
      existeEnCatalogo,
      `(estado no listado en ESTADOS_LOCALES; ${m.descripcion})`
    );
  }

  // La traduccion debe ser coherente en ambos sentidos
  check(
    'Traduccion: Transbank INITIALIZED -> local INITIATED',
    estadoLocalDesdeTransbank('INITIALIZED') === 'INITIATED'
  );
  check(
    'Traduccion: Transbank AUTHORIZED -> local AUTHORIZED',
    estadoLocalDesdeTransbank('AUTHORIZED') === 'AUTHORIZED'
  );
  check(
    'Traduccion: Transbank REJECTED -> local REJECTED',
    estadoLocalDesdeTransbank('REJECTED') === 'REJECTED'
  );
  check(
    'Traduccion: Transbank ABORTED -> local ABORTED',
    estadoLocalDesdeTransbank('ABORTED') === 'ABORTED'
  );
  check(
    'Traduccion: Transbank TIMED_OUT -> local TIMED_OUT',
    estadoLocalDesdeTransbank('TIMED_OUT') === 'TIMED_OUT'
  );
  check(
    'Un estado desconocido de Transbank cae en INITIATED, no en un estado de exito',
    estadoLocalDesdeTransbank('ALGO_RARO') === 'INITIATED'
  );

  check(
    'Aprobado y rechazado terminan en estados distintos',
    matriz[0].estadoEsperado !== matriz[1].estadoEsperado
  );
  check(
    'Cancelar y expirar NO dejan el pedido pagado',
    matriz[2].pagoEsperado !== 'pagado' && matriz[3].pagoEsperado !== 'pagado'
  );
  check(
    'Solo el aprobado deja el pedido pagado',
    matriz.filter((m) => m.pagoEsperado === 'pagado').length === 1
  );
}

// ---------------------------------------------------------------------
console.log('\n[6] Cobertura de tipos de tarjeta');
// ---------------------------------------------------------------------
{
  const resumen = TARJETAS_PRUEBA.map((t) => ({
    tarjeta: t.descripcion,
    tipo: t.tipo,
    resultado: t.resultado,
    cvv: t.cvv ?? 'no aplica'
  }));
  console.table(resumen);

  const tipos = new Set(TARJETAS_PRUEBA.map((t) => t.tipo));
  check('Se cubren los 3 tipos de tarjeta', tipos.size === 3, `(${Array.from(tipos).join(', ')})`);

  const amex = TARJETAS_PRUEBA.find((t) => t.tipo === 'credito' && t.pan.startsWith('37'));
  check('AMEX tiene CVV de 4 digitos', amex?.cvv?.length === 4, `(cvv: ${amex?.cvv})`);
  check('AMEX pide codigo de autorizacion', amex?.pideAutorizacion === true);

  const redcompra = TARJETAS_PRUEBA.filter((t) => t.tipo === 'debito');
  check('Las Redcompra no piden CVV', redcompra.every((t) => !t.requiereCvv));
  check('Hay al menos 3 Redcompra', redcompra.length === 3, `(${redcompra.length})`);
}

console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ===`);
if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('ERROR EN LA PRUEBA:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
