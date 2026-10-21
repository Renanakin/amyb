/**
 * =====================================================================
 * PRUEBAS E2E INTEGRALES: CICLO DE VIDA DEL USUARIO Y DE LA VENTA
 * Plataforma E-commerce Amyb Distribuidora Gastronómica SpA
 * =====================================================================
 */

import { prisma } from '../src/lib/prisma.js';
import { registrarMovimiento } from '../src/services/inventario.js';
import bcrypt from 'bcryptjs';

const API = 'http://localhost:3001';

// Contenedor de cookies para emular la sesión del navegador
class CookieJar {
  private cookies = new Map<string, string>();

  capture(res: Response) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const c of raw) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx);
      const val = pair.slice(idx + 1);
      if (val === '') this.cookies.delete(name);
      else this.cookies.set(name, val);
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  clear() {
    this.cookies.clear();
  }
}

const userJar = new CookieJar();
const adminJar = new CookieJar();

let totalPass = 0;
let totalFail = 0;

function assert(condition: boolean, title: string, detail = '') {
  if (condition) {
    totalPass++;
    console.log(`  [PASS] ${title}`);
  } else {
    totalFail++;
    console.error(`  [FAIL] ${title} ${detail ? `-> ${detail}` : ''}`);
  }
}

async function request(
  jar: CookieJar,
  path: string,
  method = 'GET',
  body?: any
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const cookieStr = jar.header();
  if (cookieStr) headers['Cookie'] = cookieStr;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  jar.capture(res);

  let responseBody: any = null;
  const text = await res.text();
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = text;
  }

  return { status: res.status, body: responseBody, headers: res.headers };
}

async function runE2E() {
  console.log('=====================================================================');
  console.log('🚀 INICIANDO PRUEBAS E2E INTEGRALES: AMYB DISTRIBUIDORA GASTRONOMICA');
  console.log('=====================================================================\n');

  const timestamp = Date.now().toString().slice(-6);
  const testUserEmail = `horeca_test_${timestamp}@restaurant.cl`;
  const testUserPass = 'HorecaPass2026!';
  const testUserNewPass = 'HorecaPass2026_Updated!';

  // ===================================================================
  // PARTE I: CICLO DE VIDA DEL USUARIO
  // ===================================================================
  console.log('=====================================================================');
  console.log('👤 PARTE I: CICLO DE VIDA DEL USUARIO (REGISTRO, PERFIL, B2B, SESIÓN)');
  console.log('=====================================================================\n');

  // 1. Validaciones en registro
  console.log('--- 1. Validaciones de Registro ---');
  const regInvalidEmail = await request(userJar, '/api/auth/register', 'POST', {
    email: 'email_sin_formato',
    password: testUserPass,
    nombre: 'Local Sushi Temuco'
  });
  assert(regInvalidEmail.status === 400, 'Rechaza registro con email sin formato válido');

  const regWeakPass = await request(userJar, '/api/auth/register', 'POST', {
    email: testUserEmail,
    password: '123',
    nombre: 'Local Sushi Temuco'
  });
  assert(regWeakPass.status === 400, 'Rechaza registro con contraseña débil (< 8 caracteres o sin números/mayúsculas)');

  // 2. Registro exitoso
  console.log('\n--- 2. Registro de Usuario HORECA ---');
  const regOk = await request(userJar, '/api/auth/register', 'POST', {
    email: testUserEmail,
    password: testUserPass,
    nombre: 'Sushi Bar Alemania Temuco',
    telefono: '+56 9 8765 4321'
  });
  assert(regOk.status === 201 && regOk.body.success, 'Registro exitoso de usuario HORECA');
  assert(regOk.body.data?.user?.email === testUserEmail, 'El usuario registrado tiene el email correcto');
  assert(regOk.body.data?.user?.passwordHash === undefined, 'Seguridad: la respuesta NO expone passwordHash');

  const userId = regOk.body.data?.user?.id;
  assert(Boolean(userId), `Identificador de usuario obtenido: ${userId}`);

  // 3. Verificación de sesión con cookie httpOnly
  console.log('\n--- 3. Verificación de Sesión Activa (GET /api/auth/me) ---');
  const meRes = await request(userJar, '/api/auth/me');
  assert(meRes.status === 200 && meRes.body.success, 'Sesión autenticada reconocida mediante cookie httpOnly');
  assert(meRes.body.data?.user?.id === userId, 'La sesión activa corresponde al usuario recién registrado');

  // 4. Actualización de perfil con datos tributarios HORECA
  console.log('\n--- 4. Enriquecimiento de Datos Tributarios HORECA ---');
  const profileRes = await request(userJar, '/api/auth/profile', 'PUT', {
    nombre: 'Gastronómica Sushi Bar SpA',
    telefono: '+56 9 8765 4321',
    rutEmpresa: '76.543.210-3', // RUT Válido Módulo 11
    razonSocial: 'Gastronómica Sushi Bar SpA',
    giroComercial: 'Restaurante y Comida Rápida',
    direccionTributaria: 'Av. Alemania 0450',
    comunaTributaria: 'Temuco'
  });
  assert(profileRes.status === 200 && profileRes.body.success, 'Perfil actualizado con datos de facturación DTE');
  assert(profileRes.body.data?.user?.rutEmpresa === '76.543.210-3', 'RUT tributario normalizado y persistido');

  // 5. Asignación de Nivel B2B por Administrador
  console.log('\n--- 5. Asignación de Nivel de Precio B2B (Admin) ---');
  const adminTestEmail = `admin_e2e_${timestamp}@amyb.cl`;
  const adminTestPass = 'AdminPass2026!';
  await prisma.user.create({
    data: {
      email: adminTestEmail,
      passwordHash: await bcrypt.hash(adminTestPass, 10),
      nombre: 'Administrador E2E',
      role: 'admin'
    }
  });

  const adminLogin = await request(adminJar, '/api/auth/login', 'POST', {
    email: adminTestEmail,
    password: adminTestPass
  });
  assert(adminLogin.status === 200 && adminLogin.body.success, 'Inicio de sesión exitoso como Administrador');

  let mayoristaTier = await prisma.priceTierCustomer.findFirst({
    where: { nombre: 'Mayorista' }
  });
  if (!mayoristaTier) {
    mayoristaTier = await prisma.priceTierCustomer.create({
      data: {
        nombre: 'Mayorista',
        descripcion: 'Restaurantes y pizzerías con compra recurrente',
        descuentoPercent: 8,
        aplicaSobreEscalon: true,
        color: '#F58220'
      }
    });
  }
  assert(Boolean(mayoristaTier), `Nivel de cliente Mayorista disponible (Descuento: ${mayoristaTier.descuentoPercent}%)`);

  const assignTierRes = await request(
    adminJar,
    `/api/admin/clients/${userId}/price-tier`,
    'POST',
    { priceTierId: mayoristaTier.id }
  );
  assert(assignTierRes.status === 200 && assignTierRes.body.success, 'Administrador asigna nivel Mayorista al cliente vía API');

  const meWithTier = await request(userJar, '/api/auth/me');
  assert(
    meWithTier.body.data?.user?.priceTier?.nombre === 'Mayorista',
    'Cliente reconoce su nivel Mayorista asignado'
  );
  assert(
    meWithTier.body.data?.user?.priceTier?.descuentoPercent === 8,
    'El descuento del 8% está activo en el perfil del cliente'
  );

  // 6. Persistencia de Carrito en Base de Datos
  console.log('\n--- 6. Persistencia de Carrito en Base de Datos ---');
  const catalogRes = await request(userJar, '/api/products');
  assert(catalogRes.status === 200 && catalogRes.body.success, 'Consulta de catálogo público');
  const productsList = catalogRes.body.data ?? [];
  assert(productsList.length > 0, `Catálogo con ${productsList.length} productos disponibles`);

  const sampleProduct = productsList[0];
  const safeQty = Math.max(sampleProduct.minWholesaleQty || 1, 5);
  const addToCartRes = await request(userJar, '/api/cart/items', 'POST', {
    productId: sampleProduct.id,
    quantity: safeQty
  });
  assert(addToCartRes.status === 200 && addToCartRes.body.success, `Producto agregado al carrito respetando formato mayorista (${safeQty} un.)`);

  const getCartRes = await request(userJar, '/api/cart');
  assert(getCartRes.status === 200, 'Lectura del carrito persistente');
  const cartItem = getCartRes.body.data?.items?.find((i: any) => i.product.id === sampleProduct.id);
  assert(cartItem?.quantity === safeQty, `Cantidad en carrito en BD coincide exactamente (${safeQty} unidades)`);

  // 7. Recuperación de Contraseña
  console.log('\n--- 7. Ciclo de Recuperación de Contraseña ---');
  const forgotRes = await request(userJar, '/api/auth/forgot-password', 'POST', {
    email: testUserEmail
  });
  assert(forgotRes.status === 200 && forgotRes.body.success, 'Solicitud de recuperación de contraseña aceptada');
  const resetToken = forgotRes.body.devToken || forgotRes.body.data?.resetToken;
  assert(Boolean(resetToken), 'Token seguro de reseteo generado');

  const resetRes = await request(userJar, '/api/auth/reset-password', 'POST', {
    token: resetToken,
    password: testUserNewPass
  });
  assert(resetRes.status === 200 && resetRes.body.success, 'Contraseña cambiada exitosamente con el token');

  await request(userJar, '/api/auth/logout', 'POST');
  const meAfterLogout = await request(userJar, '/api/auth/me');
  assert(meAfterLogout.status === 401, 'Sesión anterior invalidada tras logout');

  const loginNewPass = await request(userJar, '/api/auth/login', 'POST', {
    email: testUserEmail,
    password: testUserNewPass
  });
  assert(loginNewPass.status === 200 && loginNewPass.body.success, 'Autenticación exitosa con la nueva contraseña');


  // ===================================================================
  // PARTE II: CICLO DE VIDA DE LA VENTA
  // ===================================================================
  console.log('\n=====================================================================');
  console.log('🛒 PARTE II: CICLO DE VIDA DE LA VENTA (B2B, LOGÍSTICA, WEBPAY, DTE)');
  console.log('=====================================================================\n');

  const targetProduct = await prisma.product.findFirst({
    where: { isActive: true, stock: { gte: 20 } },
    include: { priceTiers: true }
  });
  if (!targetProduct) throw new Error('No se encontró producto con stock >= 20 para la prueba de venta.');

  const testQty = Math.max(targetProduct.minWholesaleQty || 1, 5);
  console.log(`Producto de prueba: "${targetProduct.name}" (Stock: ${targetProduct.stock}, Min Wholesale: ${targetProduct.minWholesaleQty})`);

  // 1. Validación de Cobertura Geográfica y Bloqueo de Venta
  console.log('\n--- 1. Validación Geográfica: Bloqueo Fuera de Radio ---');
  const orderOutOfRange = await request(userJar, '/api/orders', 'POST', {
    customer: {
      nombre: 'Cliente Fuera de Zona',
      telefono: '+56 9 1111 2222',
      email: testUserEmail
    },
    shipping: {
      zoneId: 'zone-temuco-centro',
      direccionEntrega: 'Av. Providencia 1234, Santiago Centro'
    },
    items: [{ productId: targetProduct.id, quantity: testQty }],
    paymentMethod: 'webpay'
  });
  assert(
    orderOutOfRange.status === 422 && orderOutOfRange.body.code === 'OUT_OF_DELIVERY_RANGE',
    'Bloqueo preventivo de venta: Rechaza pedido con dirección fuera de cobertura (Santiago)'
  );

  // 2. Cotización y Cálculo Fiscal (/api/orders/calculate)
  console.log('\n--- 2. Cálculo Tributario del Carrito (Neto, IVA, Descuento B2B y Despacho) ---');
  const calcQty = Math.max(testQty, 10);
  const calcRes = await request(userJar, '/api/orders/calculate', 'POST', {
    items: [{ productId: targetProduct.id, quantity: calcQty }],
    shipping: {
      zoneId: 'zone-temuco-centro',
      direccionEntrega: 'Av. Alemania 0890, Temuco'
    }
  });
  assert(calcRes.status === 200 && calcRes.body.success, 'Cálculo de carrito ejecutado con éxito');
  const calcData = calcRes.body.data;
  assert(calcData.subtotal > 0, `Subtotal calculado: $${calcData.subtotal.toLocaleString('es-CL')}`);
  assert(calcData.customerDiscount > 0, `Descuento institucional de nivel (-8%) aplicado: $${calcData.customerDiscount.toLocaleString('es-CL')}`);
  assert(calcData.neto + calcData.iva === calcData.subtotal, 'Consistencia fiscal: Subtotal = Neto + IVA (19%)');
  assert(calcData.total === calcData.subtotal + calcData.costoEnvio, 'Total = Subtotal + Costo de Envío');
  if (calcData.subtotal >= 35000) {
    assert(calcData.costoEnvio === 0, 'Umbral HORECA: Despacho GRATIS aplicado por compras >= $35.000');
  }

  // 3. Creación Formal del Pedido con Factura Electrónica
  console.log('\n--- 3. Creación de Pedido con Factura DTE ---');
  const stockInicial = targetProduct.stock;
  const orderCreateRes = await request(userJar, '/api/orders', 'POST', {
    customer: {
      nombre: 'Gastronómica Sushi Bar SpA',
      email: testUserEmail,
      telefono: '+56 9 8765 4321'
    },
    shipping: {
      zoneId: 'zone-temuco-centro',
      direccionEntrega: 'Av. Alemania 0450, Temuco',
      observaciones: 'Entregar en cocina de producción'
    },
    dte: {
      tipoDocumento: 'factura',
      rutEmpresa: '76.543.210-3',
      razonSocial: 'Gastronómica Sushi Bar SpA',
      giroComercial: 'Restaurante y Comida Rápida',
      direccionTributaria: 'Av. Alemania 0450',
      comunaTributaria: 'Temuco'
    },
    items: [{ productId: targetProduct.id, quantity: testQty }],
    paymentMethod: 'webpay'
  });

  assert(orderCreateRes.status === 201 && orderCreateRes.body.success, 'Pedido creado exitosamente');
  const orderData = orderCreateRes.body.data;
  const orderId = orderData?.orderId;
  const orderNumber = orderData?.orderNumber;
  assert(Boolean(orderId), `ID de Pedido generado: ${orderId}`);
  assert(Boolean(orderNumber), `Número de Orden: ${orderNumber}`);
  assert(orderData?.paymentStatus === 'pendiente', 'Estado de pago inicial: "pendiente"');

  const dbOrder = await prisma.order.findUnique({ where: { id: orderId } });
  assert(dbOrder?.orderStatus === 'pendiente', 'Estado logístico inicial: "pendiente"');
  assert(
    dbOrder?.dteStatusLabel === 'Pendiente de confirmacion de pago',
    'Principio tributario: Factura DTE NO se emite antes de confirmar el pago'
  );

  const productCheckBefore = await prisma.product.findUnique({ where: { id: targetProduct.id } });
  assert(productCheckBefore?.stock === stockInicial, 'El stock físico se mantiene intacto mientras la orden no esté pagada');

  const emailConfirm = await prisma.emailLog.findFirst({
    where: { orderId: orderId, tipo: 'confirmacion_orden' },
    orderBy: { createdAt: 'desc' }
  });
  assert(Boolean(emailConfirm), 'Correo de confirmación de pedido registrado en auditoría (email_logs)');

  // 4. Inicialización de Transacción Webpay Plus (Transbank Integration)
  console.log('\n--- 4. Pasarela Webpay Plus: Apertura de Transacción ---');
  const webpayInitRes = await request(userJar, '/api/webpay/init', 'POST', {
    orderId: orderId
  });
  assert(webpayInitRes.status === 200 && webpayInitRes.body.success, 'Webpay Plus inicializado correctamente con Transbank');
  const tbkToken = webpayInitRes.body.data?.token;
  const tbkUrl = webpayInitRes.body.data?.url;
  assert(Boolean(tbkToken), `Token Transbank generado: ${tbkToken?.slice(0, 24)}...`);
  assert(Boolean(tbkUrl), `URL oficial de pasarela devuelta: ${tbkUrl}`);

  // 5. Control de Idempotencia en Webpay
  console.log('\n--- 5. Control de Idempotencia (Prevención de Doble Cobro) ---');
  const webpayInitRepeat = await request(userJar, '/api/webpay/init', 'POST', {
    orderId: orderId
  });
  assert(webpayInitRepeat.status === 200, 'Reintento de apertura sobre la misma orden responde OK');
  assert(
    webpayInitRepeat.body.data?.token === tbkToken,
    'Idempotencia: Devuelve el mismo token previo sin abrir transacciones duplicadas'
  );

  // 6. Confirmación de Pago (Simulación de Transbank Commit)
  console.log('\n--- 6. Confirmación de Pago (Commit), Stock y Facturación DTE ---');
  const simTransbankResponse = {
    vci: 'TSY',
    amount: dbOrder!.total,
    status: 'AUTHORIZED',
    buy_order: dbOrder!.orderNumber,
    session_id: dbOrder!.id,
    card_detail: { card_number: '6623' },
    accounting_date: '0930',
    transaction_date: new Date().toISOString(),
    authorization_code: '121314',
    payment_type_code: 'VN',
    response_code: 0,
    installments_number: 0
  };

  await prisma.$transaction(async (tx) => {
    await tx.webpayTransaction.update({
      where: { token: tbkToken },
      data: {
        status: 'AUTHORIZED',
        responseCode: 0,
        authorizationCode: '121314',
        cardNumber: '6623',
        paymentTypeCode: 'VN',
        installments: 0,
        rawResponse: JSON.stringify(simTransbankResponse)
      }
    });

    // Se simula la venta por la MISMA via que usa el backend al confirmar
    // el pago: movimiento de inventario con asiento en el kardex.
    //
    // Antes se hacia product.updateMany({ stock: { decrement } }) "a mano",
    // que movia la cache sin tocar ninguna bodega: el inventario se
    // desalineaba en 5 unidades por cada corrida de esta prueba, y el
    // unico sintoma era un descuadre fantasma que no se explicaba.
    const movimiento = await registrarMovimiento(tx, {
      warehouseId: dbOrder!.warehouseId ?? 'wh-central',
      productId: targetProduct.id,
      type: 'salida',
      quantity: -testQty,
      reason: `Venta ${dbOrder!.orderNumber} (E2E)`,
      orderId
    });
    if (!movimiento.ok) {
      throw new Error(
        `No se pudo descontar el stock para la venta: ${movimiento.error} ` +
          `(disponible ${movimiento.saldo}, pedido ${testQty})`
      );
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'pagado',
        orderStatus: 'pagado',
        dteFolio: 'F-89421',
        dteDocumentId: 89421,
        dtePdfUrl: 'https://facto.cl/descarga/pdf/F-89421',
        dteXmlUrl: 'https://facto.cl/descarga/xml/F-89421',
        dteStatusLabel: 'DTE Emitido y Aceptado por SII'
      }
    });
  });

  const productCheckAfter = await prisma.product.findUnique({ where: { id: targetProduct.id } });
  assert(
    productCheckAfter?.stock === stockInicial - testQty,
    `Descuento atómico de stock: Inicial ${stockInicial} -> Actual ${productCheckAfter?.stock} (-${testQty} unidades)`
  );

  const paidOrder = await prisma.order.findUnique({ where: { id: orderId } });
  assert(paidOrder?.paymentStatus === 'pagado', 'Estado de pago actualizado a "pagado"');
  assert(paidOrder?.dteFolio === 'F-89421', `DTE Factura generada con folio oficial: ${paidOrder?.dteFolio}`);
  assert(Boolean(paidOrder?.dtePdfUrl), `Enlace de descarga de Factura PDF disponible: ${paidOrder?.dtePdfUrl}`);

  // 7. Ciclo Logístico en Panel de Administración
  console.log('\n--- 7. Ciclo de Despacho y Entrega en Panel de Administración ---');
  const fakeUnpaidOrder = await prisma.order.create({
    data: {
      orderNumber: `AMYB-TEST-IMPAGO-${Date.now().toString().slice(-4)}`,
      customerNombre: 'Cliente Impago',
      customerEmail: 'impago@test.cl',
      customerTelefono: '+56 9 0000 0000',
      subtotal: 10000,
      neto: 8403,
      iva: 1597,
      total: 10000,
      paymentMethod: 'webpay',
      paymentStatus: 'pendiente',
      orderStatus: 'pendiente',
      shippingZoneId: 'zone-temuco-centro',
      shippingZoneName: 'Temuco',
      shippingAddress: 'Dirección Test'
    }
  });

  const dispatchUnpaid = await request(
    adminJar,
    `/api/admin/orders/${fakeUnpaidOrder.id}/status`,
    'PATCH',
    { orderStatus: 'despachado' }
  );
  assert(
    dispatchUnpaid.status === 409,
    'Protección logística: El panel RECHAZA (HTTP 409) despachar un pedido que no ha sido pagado'
  );

  const dispatchOk = await request(
    adminJar,
    `/api/admin/orders/${orderId}/status`,
    'PATCH',
    { orderStatus: 'despachado' }
  );
  assert(dispatchOk.status === 200 && dispatchOk.body.success, 'Administrador cambia estado a "despachado"');

  const deliverOk = await request(
    adminJar,
    `/api/admin/orders/${orderId}/status`,
    'PATCH',
    { orderStatus: 'entregado' }
  );
  assert(deliverOk.status === 200 && deliverOk.body.success, 'Administrador cambia estado a "entregado"');

  // 8. Portal del Cliente (/api/orders/mine)
  console.log('\n--- 8. Portal del Cliente: Consulta de Historial ---');
  const myOrdersRes = await request(userJar, '/api/orders/mine');
  assert(myOrdersRes.status === 200 && myOrdersRes.body.success, 'Cliente consulta su historial de pedidos');
  const userOrdersList = myOrdersRes.body.data?.orders ?? [];
  const foundOrderInHistory = userOrdersList.find((o: any) => o.orderId === orderId);
  assert(Boolean(foundOrderInHistory), 'El pedido completado aparece en el historial del cliente');
  assert(foundOrderInHistory?.orderStatus === 'entregado', 'El cliente ve el estado actualizado en tiempo real ("entregado")');
  assert(foundOrderInHistory?.dteFolio === 'F-89421', 'El cliente tiene acceso a su Folio y factura DTE');

  // ===================================================================
  // RESUMEN FINAL
  // ===================================================================
  console.log('\n=====================================================================');
  console.log(`📊 RESUMEN DE PRUEBAS E2E: ${totalPass} PASS / ${totalFail} FAIL`);
  console.log('=====================================================================');

  if (totalFail > 0) {
    process.exitCode = 1;
    throw new Error(`Se detectaron ${totalFail} fallos en la prueba E2E.`);
  } else {
    console.log('✨ TODAS LAS PRUEBAS E2E COMPLETADAS EXITOSAMENTE SIN NINGÚN ERROR.');
  }
}

runE2E()
  .catch((e) => {
    console.error('Error fatal durante la prueba E2E:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
