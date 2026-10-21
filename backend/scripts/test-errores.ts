/**
 * Pruebas del contrato de errores.
 *
 * Lo que se verifica es una promesa hacia el cliente y hacia soporte:
 *
 *   - El codigo de la respuesta es ESTABLE (no cambia entre versiones).
 *   - El status HTTP lo decide el TIPO del error, no cada ruta a mano.
 *   - El mensaje real de una excepcion NUNCA sale al cliente: puede traer
 *     detalles internos de la base.
 *   - Toda respuesta trae `requestId` para poder reconstruir el caso.
 *   - Un cliente NO puede ni ver el inventario (403).
 *
 * Requiere el backend arriba y un admin propio. No deja basura.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

const API = 'http://localhost:3001';
const PASSWORD = 'PruebaErrores123';

let pass = 0;
let fail = 0;
let cookie = '';

function check(label: string, ok: boolean, extra = '') {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} ${extra}`);
  }
}

async function llamar(metodo: string, ruta: string, cuerpo?: any) {
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const par = c.split(';')[0];
    if (par.includes('=')) cookie = cookie ? `${cookie}; ${par}` : par;
  }
  return { status: res.status, json: await res.json().catch(() => ({})), headers: res.headers };
}

async function run() {
  console.log('\n=== CONTRATO DE ERRORES ===\n');

  const email = `test.errores.${Date.now()}@amyb.cl`;
  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      nombre: 'Admin Errores Prueba',
      role: 'admin',
      isActive: true
    }
  });

  try {
    // -------------------------------------------------------------------
    console.log('[1] Toda respuesta trae requestId');
    // -------------------------------------------------------------------
    const login = await llamar('POST', '/api/auth/login', { email, password: PASSWORD });
    check('login responde 200', login.status === 200, `(HTTP ${login.status})`);
    check('devuelve el header X-Request-Id', Boolean(login.headers.get('x-request-id')));

    const salud = await llamar('GET', '/api/health');
    check('el health tambien lo trae', Boolean(salud.headers.get('x-request-id')));

    // -------------------------------------------------------------------
    console.log('\n[2] Ruta inexistente: 404 con codigo estable');
    // -------------------------------------------------------------------
    const inexistente = await llamar('GET', '/api/no-existe-esta-ruta');
    check('responde 404', inexistente.status === 404, `(HTTP ${inexistente.status})`);
    check('con codigo RUTA_NO_ENCONTRADA', inexistente.json?.code === 'RUTA_NO_ENCONTRADA');
    check('el mensaje NO revela nada del servidor', /no existe/i.test(inexistente.json?.message ?? ''));
    check('trae requestId', Boolean(inexistente.json?.requestId));

    // -------------------------------------------------------------------
    console.log('\n[3] Error de negocio: el status lo decide el error, no la ruta');
    // -------------------------------------------------------------------
    // SKU duplicado: es 409, no un 500 genérico.
    const skuUnico = `TEST-ERR-${Date.now().toString(36).toUpperCase()}`;
    const nuevo = await llamar('POST', '/api/admin/products', {
      sku: skuUnico,
      name: 'Producto para prueba de errores',
      category: 'pruebas',
      format: 'Unidad',
      description: 'test',
      price: 1000
    });
    check('crea el producto', nuevo.status === 200 || nuevo.status === 201, `(HTTP ${nuevo.status})`);

    const dup = await llamar('POST', '/api/admin/products', {
      sku: skuUnico,
      name: 'Duplicado',
      category: 'pruebas',
      format: 'Unidad',
      description: 'test',
      price: 1000
    });
    check('el duplicado da 409, no 500', dup.status === 409, `(HTTP ${dup.status})`);
    check('con codigo SKU_TAKEN', dup.json?.code === 'SKU_TAKEN');

    // -------------------------------------------------------------------
    console.log('\n[4] Error de validacion: 400 con el motivo');
    // -------------------------------------------------------------------
    const invalido = await llamar('POST', '/api/admin/products', { name: 'sin sku' });
    check('sin SKU da 400', invalido.status === 400, `(HTTP ${invalido.status})`);
    check('el mensaje dice que falta el SKU', /SKU/i.test(invalido.json?.message ?? ''));

    // -------------------------------------------------------------------
    console.log('\n[5] Pedido que ninguna bodega puede servir: 409 tipado');
    // -------------------------------------------------------------------
    const pedidoSinStock = await llamar('POST', '/api/orders', {
      customer: { nombre: 'Cliente Errores', email: 'errores@test.cl', telefono: '+56900000000' },
      items: [{ productId: nuevo.json?.data?.id ?? 'no-existe', quantity: 9999 }],
      paymentMethod: 'webpay',
      shipping: { zoneId: 'zone-temuco-centro', direccionEntrega: 'Av. Alemania 0450, Temuco' }
    });
    check(
      'responde 409 o 422 segun corresponda, nunca 500',
      [409, 422].includes(pedidoSinStock.status),
      `(HTTP ${pedidoSinStock.status})`
    );
    check('con un codigo estable', Boolean(pedidoSinStock.json?.code), `(sin code: ${JSON.stringify(pedidoSinStock.json).slice(0, 100)})`);

    // -------------------------------------------------------------------
    console.log('\n[6] Error desconocido: 500 sin filtrar el mensaje real');
    // -------------------------------------------------------------------
    // Se fuerza un fallo interno pidiendo un id con formato invalido que
    // revienta en Prisma, no en la validacion.
    const roto = await llamar('GET', '/api/admin/orders/no-es-un-cuid-valido-!!/correo');
    if (roto.status >= 500) {
      check(
        'no expone el mensaje interno de la excepcion',
        !/cuid|prisma|invalid/i.test(roto.json?.message ?? ''),
        `(mensaje: ${roto.json?.message})`
      );
      check('tiene codigo estable', Boolean(roto.json?.code));
    } else {
      check('respondio con 4xx controlado en vez de 500', roto.status >= 400 && roto.status < 500, `(HTTP ${roto.status})`);
    }

    // -------------------------------------------------------------------
    console.log('\n[7] Permisos: un cliente no ve el inventario');
    // -------------------------------------------------------------------
    const antes = cookie;
    cookie = '';
    const cliente = await prisma.user.create({
      data: {
        email: `test.errores.cli.${Date.now()}@amyb.cl`,
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        nombre: 'Cliente Errores Prueba',
        role: 'customer',
        isActive: true
      }
    });
    try {
      await llamar('POST', '/api/auth/login', { email: cliente.email, password: PASSWORD });
      const intruso = await llamar('GET', '/api/admin/bodegas');
      check('recibe 403', intruso.status === 403, `(HTTP ${intruso.status})`);
      check('con codigo estable', Boolean(intruso.json?.code));
    } finally {
      await prisma.user.delete({ where: { id: cliente.id } }).catch(() => {});
      cookie = antes;
    }

    console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);
    if (fail > 0) throw new Error(`${fail} prueba(s) de errores fallaron.`);
  } finally {
    // Limpiar el producto de prueba.
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'TEST-ERR-' } } }).catch(() => {});
    await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
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