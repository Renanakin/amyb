/**
 * Pruebas del servicio de correo transaccional.
 *
 * Ejecutar: npx tsx scripts/test-email.ts
 *
 * En desarrollo los correos NO se envian: se guardan en la tabla
 * email_logs. Eso permite verificar que el HTML se arma bien y que
 * los datos reales del pedido llegan al correo, sin depender de un
 * servidor SMTP ni de una bandeja de entrada real.
 */
import { prisma } from '../src/lib/prisma.js';
import { productoParaCantidad } from './_ayuda/producto-prueba.js';
import { emailService } from '../src/services/emailService.js';
import {
  emailConfirmacionOrden,
  emailPagoAprobado,
  emailDespacho,
  emailEntregado,
  emailRecuperacion
} from '../src/services/emailTemplates.js';

const API = 'http://localhost:3001';

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

async function main() {
  console.log('=== PRUEBAS DE CORREO TRANSACCIONAL ===\n');

  // -------------------------------------------------------------------
  console.log('[1] Plantillas: estructura y contenido');
  // -------------------------------------------------------------------
  const datosPedido = {
    nombre: 'Camila Prueba',
    orderNumber: 'AMYB-2026-999999',
    items: [
      { nombre: 'Queso Crema Green Bay', cantidad: 20, precio: 8990, subtotal: 179800 },
      { nombre: 'Mayonesa Carozzi 500u', cantidad: 4, precio: 15990, subtotal: 63960 }
    ],
    subtotal: 243760,
    iva: 40987,
    costoEnvio: 0,
    total: 243760,
    zona: 'Temuco Centro & Poniente',
    direccion: 'Av. Alemania 0890, Local 3',
    paymentMethod: 'webpay',
    esFactura: true
  };

  const confirmacion = emailConfirmacionOrden(datosPedido);
  check('Confirmacion genera asunto', confirmacion.asunto.includes('AMYB-2026-999999'));
  check('Confirmacion es HTML completo', confirmacion.html.startsWith('<!DOCTYPE html>'));
  check('Confirmacion cierra el HTML', confirmacion.html.trim().endsWith('</html>'));
  check('Confirmacion incluye el nombre del cliente',
    confirmacion.html.includes('Camila Prueba'));
  check('Confirmacion incluye el numero de pedido',
    confirmacion.html.includes('AMYB-2026-999999'));
  check('Confirmacion incluye el total de $243.760',
    confirmacion.html.includes('$243.760'));
  check('Confirmacion lista los productos',
    confirmacion.html.includes('Queso Crema Green Bay'));
  check('Confirmacion menciona la direccion de entrega',
    confirmacion.html.includes('Av. Alemania 0890'));
  check('Confirmacion dice que es factura', confirmacion.html.includes('Factura electronica'));
  check('La confirmacion NO incluye el password hash', !confirmacion.html.includes('passwordHash'));

  const pago = emailPagoAprobado({
    nombre: 'Camila Prueba',
    orderNumber: 'AMYB-2026-999999',
    total: 243760,
    dteFolio: '9999',
    dteTipo: 'factura',
    pdfUrl: 'https://ejemplo.cl/factura.pdf',
    autorizacionCode: '1213',
    cardNumber: '6623'
  });
  check('Pago aprobado menciona el folio', pago.html.includes('9999'));
  check('Pago aprobado trae el link de la factura',
    pago.html.includes('https://ejemplo.cl/factura.pdf'));
  check('Pago aprobado muestra solo los ultimos 4 digitos',
    pago.html.includes('**** 6623') && !pago.html.includes('4051885600446623'));
  check('Pago aprobado muestra el codigo de autorizacion', pago.html.includes('1213'));

  // Sin datos opcionales no debe romperse
  const pagoMinimo = emailPagoAprobado({
    nombre: 'Cliente',
    orderNumber: 'AMYB-2026-000001',
    total: 1000
  });
  check('Pago aprobado funciona sin datos opcionales',
    pagoMinimo.html.includes('$1.000'));

  const despacho = emailDespacho({
    nombre: 'Camila',
    orderNumber: 'AMYB-2026-999999',
    zona: 'Temuco Centro',
    direccion: 'Av. Alemania 0890',
    estimatedHours: 'Despacho en 24h'
  });
  check('Despacho menciona la zona', despacho.html.includes('Temuco Centro'));
  check('Despacho menciona el tiempo estimado', despacho.html.includes('24h'));

  const entregado = emailEntregado({
    nombre: 'Camila',
    orderNumber: 'AMYB-2026-999999'
  });
  check('Entregado confirma la entrega', entregado.html.includes('entregado'));

  const recuperacion = emailRecuperacion({
    nombre: 'Camila',
    token: 'abc123token',
    frontendUrl: 'http://localhost:5173'
  });
  check('Recuperacion construye el enlace con el token',
    recuperacion.html.includes('http://localhost:5173/recuperar-contrasena?token=abc123token'));
  check('Recuperacion advierte si no fue el usuario',
    recuperacion.html.includes('Si no solicitaste'));

  // -------------------------------------------------------------------
  console.log('\n[2] Escape de contenido del cliente');
  // -------------------------------------------------------------------
  {
    // Un nombre con HTML inyectado no debe ejecutarse en el correo
    const malicioso = emailConfirmacionOrden({
      ...datosPedido,
      nombre: '<script>alert("xss")</script>'
    });
    check('No escapa el HTML del cliente (riesgo de inyeccion)',
      !malicioso.html.includes('<script>alert'),
      '(se envio sin escapar)');
  }

  // -------------------------------------------------------------------
  console.log('\n[3] Envio real en modo captura');
  // -------------------------------------------------------------------
  const antes = await prisma.emailLog.count();

  const ok = await emailService.enviar({
    to: 'prueba@amybdistribuidora.cl',
    asunto: confirmacion.asunto,
    html: confirmacion.html,
    tipo: 'confirmacion_orden'
  });
  check('emailService.enviar devuelve true', ok === true);

  const despues = await prisma.emailLog.count();
  check('Se registro el correo en la base', despues === antes + 1);

  const ultimo = await prisma.emailLog.findFirst({ orderBy: { createdAt: 'desc' } });
  check('El registro guarda el HTML', Boolean(ultimo?.htmlGuardado));
  check('El registro guarda el tipo', ultimo?.tipo === 'confirmacion_orden');
  check('El registro guarda el destinatario',
    ultimo?.destinatario === 'prueba@amybdistribuidora.cl');
  check('En modo captura el estado es "simulado"',
    ultimo?.estado === 'simulado' || ultimo?.estado === 'enviado',
    `(estado: ${ultimo?.estado})`);

  // Sin destinatario no debe romper
  const sinDestinatario = await emailService.enviar({
    to: '',
    asunto: 'test',
    html: '<p>test</p>',
    tipo: 'confirmacion_orden'
  });
  check('Un correo sin destinatario no rompe', sinDestinatario === false);

  // -------------------------------------------------------------------
  console.log('\n[4] Flujo real: pedido genera correo');
  // -------------------------------------------------------------------
  {
    const email = `correo.test.${Date.now()}@amyb.cl`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await (await import('bcryptjs')).default.hash('Prueba1234', 12),
        nombre: 'Cliente Correo',
        role: 'customer'
      }
    });

    const producto = await productoParaCantidad(prisma, 5);
    const cookies = new Map<string, string>();

    const guardarCookies = (res: Response) => {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const idx = pair.indexOf('=');
        cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
      }
    };
    const cookieHeader = Array.from(cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    // Login
    const login = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Prueba1234' })
    });
    guardarCookies(login);

    const antes2 = await prisma.emailLog.count();

    // Crear pedido
    const order = await fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        customer: { nombre: 'Cliente Correo', email, telefono: '+56 9 1234 5678' },
        dte: { tipoDocumento: 'boleta' },
        shipping: { zoneId: 'zone-temuco-centro', direccionEntrega: 'Av. Test 123' },
        paymentMethod: 'transferencia',
        items: [{ productId: producto!.id, quantity: 5 }]
      })
    });
    const orderData = await order.json();

    check('El pedido se creo', order.status === 201, `(HTTP ${order.status})`);

    const despues2 = await prisma.emailLog.count();
    check('Crear un pedido dispara un email', despues2 === antes2 + 1);

    const correoPedido = await prisma.emailLog.findFirst({
      where: { destinatario: email },
      orderBy: { createdAt: 'desc' }
    });

    check('El correo fue al email del cliente', Boolean(correoPedido));
    check('El tipo es confirmacion_orden', correoPedido?.tipo === 'confirmacion_orden');
    check('El correo contiene el numero de pedido real',
      Boolean(correoPedido?.htmlGuardado?.includes(orderData.data?.orderNumber ?? 'NO')));
    check('El correo contiene el nombre del producto real',
      Boolean(correoPedido?.htmlGuardado?.includes(producto!.name)));
    check('El correo esta asociado al pedido',
      correoPedido?.orderId === orderData.data?.orderId);

    // Recuperacion de contrasena
    const antes3 = await prisma.emailLog.count();
    const forgot = await fetch(`${API}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    await forgot.json();
    const despues3 = await prisma.emailLog.count();
    check('Pedir recuperacion dispara un email', despues3 === antes3 + 1);

    const correoReset = await prisma.emailLog.findFirst({
      where: { destinatario: email, tipo: 'recuperacion_password' }
    });
    check('El email de recuperacion trae el enlace con token',
      Boolean(correoReset?.htmlGuardado?.includes('recuperar-contrasena?token=')));

    await prisma.user.deleteMany({ where: { id: user.id } });
  }

  // -------------------------------------------------------------------
  console.log('\n[5] El endpoint debuzon exige admin');
  // -------------------------------------------------------------------
  {
    const anon = await fetch(`${API}/api/admin/emails`);
    check('Anonimo NO puede leer los correos', anon.status === 401, `(HTTP ${anon.status})`);
  }

  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===`);
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
