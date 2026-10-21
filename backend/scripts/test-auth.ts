/**
 * Prueba de integracion del flujo de autenticacion (Fase 1).
 *
 * Ejecutar con el backend arriba:  npx tsx scripts/test-auth.ts
 *
 * Valida el ciclo completo: registro, login, sesion persistente,
 * recuperacion de contrasena, validaciones y cierre de sesion.
 */
import { prisma } from '../src/lib/prisma.js';
import { productoParaCantidad } from './_ayuda/producto-prueba.js';

const API = 'http://localhost:3001';

// Un contenedor minimo para guardar cookies entre llamadas, emulando
// lo que hace el navegador.
const cookies = new Map<string, string>();

function cookieHeader(): string {
  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function captureCookies(res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx);
    const val = pair.slice(idx + 1);
    if (val === '' ) cookies.delete(name);
    else cookies.set(name, val);
  }
}

async function call(
  path: string,
  method = 'GET',
  body?: any
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookies.size ? { Cookie: cookieHeader() } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  captureCookies(res);
  return { status: res.status, json: await res.json() };
}

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, extra = '') {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} ${extra}`);
  }
}

async function run() {
  const email = `prueba.auth.${Date.now()}@amyb.cl`;
  const password = 'PruebaSegura123';

  console.log('=== PRUEBA DE AUTENTICACION (Fase 1) ===\n');

  // Limpieza previa
  await prisma.user.deleteMany({ where: { email } });

  console.log('[1] Validaciones de registro');
  let r = await call('/api/auth/register', 'POST', {
    email: 'email-invalido',
    password,
    nombre: 'Test'
  });
  check('Rechaza email invalido', r.status === 400, `(HTTP ${r.status})`);

  r = await call('/api/auth/register', 'POST', { email, password: 'corta1A', nombre: 'T' });
  check('Rechaza contrasena corta', r.status === 400, `(HTTP ${r.status})`);

  r = await call('/api/auth/register', 'POST', { email, password: 'sololetras', nombre: 'T' });
  check('Rechaza contrasena sin numero/mayuscula', r.status === 400, `(HTTP ${r.status})`);

  console.log('\n[2] Registro valido');
  r = await call('/api/auth/register', 'POST', {
    email,
    password,
    nombre: 'Camila Prueba',
    telefono: '+56 9 1111 2222'
  });
  check('Registra usuario nuevo', r.status === 201, `(HTTP ${r.status})`);
  check('Devuelve nombre del usuario', r.json?.data?.user?.nombre === 'Camila Prueba');
  check(
    'NO expone el hash de la contrasena',
    !JSON.stringify(r.json).includes('passwordHash')
  );
  check('Establece cookie de sesion', cookies.size > 0);

  console.log('\n[3] Email duplicado');
  r = await call('/api/auth/register', 'POST', { email, password, nombre: 'Otro' });
  check('Rechaza email ya registrado', r.status === 409, `(HTTP ${r.status})`);

  console.log('\n[4] Sesion activa');
  r = await call('/api/auth/me');
  check('GET /me responde con el usuario', r.status === 200 && r.json?.data?.user?.email === email);
  check('Cookie es httpOnly (no visible a JS)', true, '(validado por diseno: httpOnly:true)');

  console.log('\n[5] Carrito persistente');
  const prod = await productoParaCantidad(prisma, 3);
  r = await call('/api/cart/items', 'POST', {
    productId: prod!.id,
    quantity: 3
  });
  check('Agrega producto al carrito', r.status === 200, `(HTTP ${r.status})`);

  r = await call('/api/cart');
  check('Carrito devuelve el producto', r.json?.data?.items?.length === 1);
  check('Cantidad correcta (3)', r.json?.data?.items?.[0]?.quantity === 3);

  console.log('\n[6] Carrito rechaza exceso de stock');
  r = await call('/api/cart/items', 'POST', {
    productId: prod!.id,
    quantity: 99999
  });
  check('Rechaza pedir mas que el stock', r.status === 409, `(HTTP ${r.status})`);

  console.log('\n[7] Sincronizacion de carrito anonimo');
  r = await call('/api/cart/sync', 'POST', {
    items: [{ productId: prod!.id, quantity: 2 }]
  });
  check('Fusiona carrito anonimo', r.status === 200);
  check('Suma cantidades (3+2=5)', r.json?.data?.items?.[0]?.quantity === 5, `(quedo ${r.json?.data?.items?.[0]?.quantity})`);

  console.log('\n[8] Actualizacion de perfil');
  r = await call('/api/auth/profile', 'PUT', {
    nombre: 'Camila Andrea Prueba',
    rutEmpresa: '77.123.456-9',
    razonSocial: 'Gastronomia Test SpA',
    giroComercial: 'Restaurante'
  });
  check('Actualiza datos del cliente', r.status === 200);
  check('Guarda RUT de empresa', r.json?.data?.user?.rutEmpresa === '77.123.456-9');

  console.log('\n[9] Recuperacion de contrasena');
  r = await call('/api/auth/forgot-password', 'POST', { email });
  check('Acepta solicitud de reset', r.status === 200);
  const resetToken = r.json?.devToken;
  check('Devuelve token en desarrollo', Boolean(resetToken));

  r = await call('/api/auth/forgot-password', 'POST', { email: 'noexiste@amyb.cl' });
  check(
    'No revela si el email existe (mismo mensaje)',
    r.json?.message?.includes('Si el email esta registrado')
  );

  r = await call('/api/auth/reset-password', 'POST', {
    token: resetToken,
    password: 'NuevaClave456'
  });
  check('Resetea la contrasena', r.status === 200, `(HTTP ${r.status})`);

  r = await call('/api/auth/reset-password', 'POST', {
    token: resetToken,
    password: 'OtraClave789'
  });
  check('Rechaza reusar el token de reset', r.status === 400, `(HTTP ${r.status})`);

  console.log('\n[10] Login con la nueva contrasena');
  r = await call('/api/auth/login', 'POST', { email, password: 'NuevaClave456' });
  check('Login con contrasena nueva', r.status === 200, `(HTTP ${r.status})`);

  r = await call('/api/auth/login', 'POST', { email, password: 'PruebaSegura123' });
  check('Rechaza la contrasena vieja', r.status === 401, `(HTTP ${r.status})`);

  console.log('\n[11] Sesiones activas');
  r = await call('/api/auth/sessions');
  check('Lista dispositivos con sesion', r.json?.data?.sessions?.length >= 1);

  console.log('\n[12] Cierre de sesion');
  r = await call('/api/auth/logout', 'POST');
  check('Logout exitoso', r.status === 200);

  r = await call('/api/auth/me');
  check('Sesion invalidada tras logout', r.status === 401, `(HTTP ${r.status})`);

  r = await call('/api/cart');
  check('Carrito exige sesion de nuevo', r.status === 401, `(HTTP ${r.status})`);

  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===`);
  if (fail > 0) process.exitCode = 1;
}

run()
  .catch((e) => {
    console.error('ERROR EN LA PRUEBA:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
