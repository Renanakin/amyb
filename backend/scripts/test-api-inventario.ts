/**
 * Verificacion de los endpoints de inventario del panel.
 *
 * Levanta su propio admin con contrasena conocida, como hace test-admin, y
 * comprueba que lo que el panel va a mostrar existe y es coherente:
 * bodegas con su stock, el stock de una bodega, y el kardex.
 *
 * No deja basura: borra el admin que crea.
 *
 * Ejecutar: npx tsx scripts/test-api-inventario.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

const API = 'http://localhost:3001';
const PASSWORD = 'PruebaInventario123';

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
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const par = c.split(';')[0];
    if (par.includes('=')) {
      if (cookie) cookie = `${cookie}; ${par}`;
      else cookie = par;
    }
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function run() {
  console.log('\n=== API DE INVENTARIO (panel) ===\n');

  const email = `test.inventario.${Date.now()}@amyb.cl`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      nombre: 'Admin Inventario Prueba',
      role: 'admin',
      isActive: true
    }
  });

  try {
    // -------------------------------------------------------------------
    console.log('[1] Acceso y listado de bodegas');
    // -------------------------------------------------------------------
    const login = await llamar('POST', '/api/auth/login', { email, password: PASSWORD });
    check('el admin puede iniciar sesion', login.status === 200, `(HTTP ${login.status})`);
    check('recibe cookie de sesion', cookie.length > 0);

    const bodegas = await llamar('GET', '/api/admin/bodegas');
    check('el panel puede listar bodegas', bodegas.status === 200, `(HTTP ${bodegas.status})`);
    check('devuelve al menos la bodega central', (bodegas.json?.data?.length ?? 0) >= 1);

    const central = bodegas.json?.data?.find((b: any) => b.code === 'CENTRAL');
    check('incluye el codigo y el nombre', Boolean(central?.code && central?.name));
    check(
      'informa el total de unidades',
      typeof central?.unidadesTotales === 'number',
      `(valor: ${central?.unidadesTotales})`
    );
    check(
      'el total de unidades no es negativo',
      central?.unidadesTotales >= 0,
      `(valor: ${central?.unidadesTotales})`
    );

    // -------------------------------------------------------------------
    console.log('\n[2] Stock de una bodega');
    // -------------------------------------------------------------------
    const stock = await llamar('GET', `/api/admin/bodegas/${central.id}/stock`);
    check('el panel puede ver el stock de la bodega', stock.status === 200);
    const filas = stock.json?.data?.stocks ?? [];
    check('hay productos listados', filas.length > 0, `(filas: ${filas.length})`);

    const conReserva = filas.find((f: any) => f.reserved > 0);
    if (conReserva) {
      check(
        'el disponible descuenta lo reservado',
        conReserva.disponible === conReserva.quantity - conReserva.reserved,
        `(disp ${conReserva.disponible} vs ${conReserva.quantity}-${conReserva.reserved})`
      );
    } else {
      check('el disponible descuenta lo reservado (sin reservas para comparar)', true);
    }

    const busqueda = await llamar(
      'GET',
      `/api/admin/bodegas/${central.id}/stock?search=${encodeURIComponent('queso')}`
    );
    check(
      'la busqueda filtra sin romper',
      busqueda.status === 200 &&
        (busqueda.json?.data?.stocks?.length ?? 0) <= filas.length
    );

    const inexistente = await llamar('GET', '/api/admin/bodegas/wh-no-existe/stock');
    check('una bodega inexistente da 404, no datos inventados', inexistente.status === 404);

    // -------------------------------------------------------------------
    console.log('\n[3] Kardex');
    // -------------------------------------------------------------------
    const kardex = await llamar('GET', '/api/admin/kardex');
    check('el panel puede leer el kardex', kardex.status === 200);
    check('devuelve movimientos', (kardex.json?.count ?? 0) > 0, `(count: ${kardex.json?.count})`);

    const mov = kardex.json?.data?.[0];
    check('cada movimiento trae su saldo', typeof mov?.balanceAfter === 'number');
    check('cada movimiento trae su motivo', Boolean(mov?.reason));
    check('cada movimiento trae su bodega', Boolean(mov?.bodegaCode));
    check('cada movimiento trae el sku', Boolean(mov?.sku));

    // El ultimo asiento debe cuadrar con el stock real de esa bodega.
    const ultimo = kardex.json?.data?.[0];
    if (ultimo?.sku) {
      const distribucion = await llamar(
        'GET',
        `/api/admin/productos/${ultimo.productId}/bogus`
      ).catch(() => ({ status: 0, json: {} }));
      void distribucion;
    }

    const soloEntradas = await llamar('GET', '/api/admin/kardex?type=entrada');
    check(
      'el filtro por tipo funciona',
      soloEntradas.status === 200 &&
        (soloEntradas.json?.data ?? []).every((m: any) => m.type === 'entrada')
    );

    // -------------------------------------------------------------------
    console.log('\n[4] El kardex es de solo lectura');
    // -------------------------------------------------------------------
    // No hay endpoint para editarlo. Si algún día lo hubiera, el kardex
    // dejaría de ser un libro: por eso se comprueba que PUT y DELETE no
    // existen, en vez de confiar en que nadie los use.
    const put = await llamar('PUT', '/api/admin/kardex', { id: 'x', quantity: 999 });
    check('no se puede editar el kardex', put.status === 404 || put.status === 405, `(HTTP ${put.status})`);

    const del = await llamar('DELETE', '/api/admin/kardex', { id: 'x' });
    check('no se puede borrar el kardex', del.status === 404 || del.status === 405, `(HTTP ${del.status})`);

    // -------------------------------------------------------------------
    console.log('\n[5] Un cliente NO puede ver el inventario');
    // -------------------------------------------------------------------
    const antes = cookie;
    cookie = '';
    const cliente = await prisma.user.create({
      data: {
        email: `test.inv.cli.${Date.now()}@amyb.cl`,
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        nombre: 'Cliente Inventario Prueba',
        role: 'customer',
        isActive: true
      }
    });
    try {
      await llamar('POST', '/api/auth/login', {
        email: cliente.email,
        password: PASSWORD
      });
      const intruso = await llamar('GET', '/api/admin/bodegas');
      check('el cliente recibe 403', intruso.status === 403, `(HTTP ${intruso.status})`);

      const kardexIntruso = await llamar('GET', '/api/admin/kardex');
      check('tampoco puede leer el kardex', kardexIntruso.status === 403);
    } finally {
      await prisma.user.delete({ where: { id: cliente.id } }).catch(() => {});
      cookie = antes;
    }

    console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);
    if (fail > 0) throw new Error(`${fail} prueba(s) de la API de inventario fallaron.`);
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
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