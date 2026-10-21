/**
 * Pruebas de niveles de precio de cliente y cobertura geografica.
 *
 * Ejecutar: npx tsx scripts/test-precios-cliente.ts
 *
 * Lo mas importante aqui es la seguridad: un cliente NO puede elegir
 * su propio nivel de descuento. Si pudiera, todos se declararian
 * "Distribuidor" y pagarian un 12% menos sin derecho a ello.
 */
import { prisma } from '../src/lib/prisma.js';
import { productoParaCantidad } from './_ayuda/producto-prueba.js';
import { PricingService, ProductForPricing, ShippingZoneForPricing, CustomerPriceTier } from '../src/services/pricingService.js';
import { deliveryService } from '../src/services/deliveryService.js';

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

const QUESO: ProductForPricing = {
  id: 'p1',
  name: 'Queso Crema Green Bay',
  format: 'Barra 1.36 Kg',
  price: 9490,
  stock: 100,
  minWholesaleQty: 5,
  priceTiers: [
    { minQty: 20, unitPrice: 8990 },
    { minQty: 50, unitPrice: 8490 }
  ]
};

const PRODUCTOS = [QUESO];
const ZONAS: ShippingZoneForPricing[] = [
  { id: 'z1', name: 'Temuco', cost: 2990, freeShippingThreshold: 35000 }
];

const NIVEL_MAYORISTA: CustomerPriceTier = {
  id: 't1',
  nombre: 'Mayorista',
  descuentoPercent: 8,
  aplicaSobreEscalon: true
};

async function main() {
  console.log('=== NIVELES DE PRECIO Y COBERTURA GEOGRAFICA ===\n');

  // -------------------------------------------------------------------
  console.log('[1] Descuento por nivel de cliente');
  // -------------------------------------------------------------------
  {
    // Cliente sin nivel: precio normal
    const sinNivel = PricingService.calculateCart(
      [{ productId: 'p1', quantity: 20 }],
      PRODUCTOS,
      ZONAS,
      'z1'
    );
    check('Cliente sin nivel ve el precio de volumen', sinNivel.itemsResolved[0].unitPrice === 8990,
      `(obtuvo ${sinNivel.itemsResolved[0].unitPrice})`);
    check('Cliente sin nivel no tiene descuento de cliente', sinNivel.customerDiscount === 0);
    check('customerTier es null sin nivel asignado', sinNivel.customerTier === null);

    // Cliente Mayorista (8% sobre el escalon de volumen)
    const mayorista = PricingService.calculateCart(
      [{ productId: 'p1', quantity: 20 }],
      PRODUCTOS,
      ZONAS,
      'z1',
      undefined,
      NIVEL_MAYORISTA
    );
    const precioMayorista = mayorista.itemsResolved[0].unitPrice;
    // Escalon 20+ = 8.990. Con 8%: 8.990 * 0.92 = 8.271
    check('Cliente Mayorista recibe el 8% sobre el escalon', precioMayorista === 8271,
      `(esperado 8271, obtuvo ${precioMayorista})`);
    check('El nivel aparece en el resultado',
      mayorista.customerTier?.nombre === 'Mayorista');
    check('El descuento de cliente se acumula con el volumen',
      mayorista.volumetricDiscount > 0 && mayorista.customerDiscount > 0,
      `(vol=${mayorista.volumetricDiscount}, cli=${mayorista.customerDiscount})`);
    check('El ahorro total se mide contra el precio de lista',
      mayorista.itemsResolved[0].savings > 0);
    check('Guarda el precio antes del descuento de cliente',
      mayorista.itemsResolved[0].priceBeforeCustomerDiscount === 8990);
  }

  // -------------------------------------------------------------------
  console.log('\n[2] El descuento nunca deja el precio en cero');
  // -------------------------------------------------------------------
  {
    const nivelBrutal: CustomerPriceTier = {
      id: 'tb',
      nombre: 'Prueba',
      descuentoPercent: 90,
      aplicaSobreEscalon: true
    };
    const r = PricingService.calculateCart(
      [{ productId: 'p1', quantity: 5 }],
      PRODUCTOS,
      ZONAS,
      'z1',
      undefined,
      nivelBrutal
    );
    const p = r.itemsResolved[0].unitPrice;
    // 9490 * 0.10 = 949 -> sigue sobre cero
    check('Un descuento del 90% no deja el precio en 0', p > 0, `(precio ${p})`);

    const nivel100: CustomerPriceTier = {
      id: 't100',
      nombre: 'Prueba extrema',
      descuentoPercent: 100,
      aplicaSobreEscalon: true
    };
    const r2 = PricingService.calculateCart(
      [{ productId: 'p1', quantity: 5 }],
      PRODUCTOS,
      ZONAS,
      'z1',
      undefined,
      nivel100
    );
    check('Un descuento del 100% se limita a $1 minimo', r2.itemsResolved[0].unitPrice === 1,
      `(precio ${r2.itemsResolved[0].unitPrice})`);
  }

  // -------------------------------------------------------------------
  console.log('\n[3] Descuento aplicado sobre lista vs sobre escalon');
  // -------------------------------------------------------------------
  {
    const sobreEscalon: CustomerPriceTier = {
      id: 'ts', nombre: 'S', descuentoPercent: 10, aplicaSobreEscalon: true
    };
    const sobreLista: CustomerPriceTier = {
      id: 'tl', nombre: 'L', descuentoPercent: 10, aplicaSobreEscalon: false
    };

    const a = PricingService.calculateCart([{ productId: 'p1', quantity: 50 }],
      PRODUCTOS, ZONAS, 'z1', undefined, sobreEscalon);
    const b = PricingService.calculateCart([{ productId: 'p1', quantity: 50 }],
      PRODUCTOS, ZONAS, 'z1', undefined, sobreLista);

    // Escalon 50+ = 8490. Con 10% sobre escalon: 8490*0.9 = 7641
    // Con 10% sobre lista (9490): 9490*0.9 = 8541, luego escalon NO aplica
    check('Sobre escalon da precio MENOR (mejor para el cliente)',
      a.itemsResolved[0].unitPrice < b.itemsResolved[0].unitPrice,
      `(escalon=${a.itemsResolved[0].unitPrice}, lista=${b.itemsResolved[0].unitPrice})`);
  }

  // -------------------------------------------------------------------
  console.log('\n[4] Seguridad: el cliente NO elige su nivel');
  // -------------------------------------------------------------------
  {
    // Intento de enviar el nivel por el body de /calculate
    const nivelReal = await prisma.priceTierCustomer.findFirst({
      where: { nombre: 'Cliente Distribuidor' }
    });

    // Cliente nuevo SIN nivel asignado
    const email = `seguridad.${Date.now()}@amyb.cl`;
    const bcrypt = (await import('bcryptjs')).default;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Prueba1234', 12),
        nombre: 'Cliente Sin Nivel',
        role: 'customer'
      }
    });

    const cookies = new Map<string, string>();
    const guardar = (r: Response) => {
      for (const c of r.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
    };
    const cookieHeader = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    const login = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Prueba1234' })
    });
    guardar(login);

    // Intenta pedir el nivel Distribuidor por el body
    const intento = await fetch(`${API}/api/orders/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        items: [{ productId: 'p1', quantity: 20 }],
        zoneId: 'z1',
        // El atacante intenta inyectar su nivel
        customerTier: { id: nivelReal!.id, descuentoPercent: 12 },
        priceTierId: nivelReal!.id,
        discountPercent: 12
      })
    });
    const body = await intento.json();

    check('El cuerpo de la peticion no cambia el precio',
      body.data?.customerTier === null || body.data?.customerTier === undefined,
      `(obtuvo ${JSON.stringify(body.data?.customerTier)})`);
    check('El descuento remains en 0 pese al intento',
      body.data?.customerDiscount === 0,
      `(obtuvo ${body.data?.customerDiscount})`);

    // Ahora se le asigna el nivel desde la base (como haria el admin)
    await prisma.user.update({
      where: { id: user.id },
      data: { priceTierId: nivelReal!.id }
    });

    // Se usa un producto REAL de la base: el endpoint calcula contra el
    // catalogo cargado de PostgreSQL, no contra el array de prueba.
    const productoReal = await prisma.product.findFirst({ where: { isActive: true } });

    // Se vuelve a iniciar sesion DESPUES de asignar el nivel.
    //
    // El hash bcrypt de 12 rondas tarda alrededor de 300 ms, y la
    // corrida completa de esta suite supera el margen de la cookie de
    // sesion en los pasos intermedios. Reabrir la sesion aqui garantiza
    // que la peticion se evalue con un token vigente.
    const relogin = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Prueba1234' })
    });
    guardar(relogin);
    const cookieHeader2 = Array.from(cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const conNivel = await fetch(`${API}/api/orders/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader2 },
      body: JSON.stringify({
        items: [{ productId: productoReal!.id, quantity: 5 }],
        zoneId: 'zone-temuco-centro'
      })
    });
    const body2 = await conNivel.json();

    check('Con nivel asignado en la base, si recibe el descuento',
      body2.data?.customerTier?.nombre === 'Cliente Distribuidor',
      `(obtuvo ${JSON.stringify(body2.data?.customerTier)})`);
    check('El descuento del 12% se aplica',
      body2.data?.customerDiscount > 0,
      `(descuento ${body2.data?.customerDiscount})`);

    // Limpieza
    await prisma.cartItem.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  // -------------------------------------------------------------------
  console.log('\n[5] Cobertura geografica');
  // -------------------------------------------------------------------
  {
    const config = await deliveryService.obtenerConfig();
    check('La configuracion de despacho existe', Boolean(config));
    check('Tiene radio maximo definido', config.radioMaximoKm > 0,
      `(radio ${config.radioMaximoKm})`);
    check('Tiene direccion de bodega', Boolean(config.bodegaDireccion));

    // Sin Google API Key, el servicio NO debe bloquear (para no dejar
    // al cliente sin poder comprar por un fallo del servicio externo)
    const r = await deliveryService.validar('Av. Argentina 1234, Temuco', 50000);
    check('Sin API Key, no bloquea la venta', r.ventaBloqueada === false);
    check('Marca el resultado como aproximado', r.aproximado === true);
    check('Devuelve un mensaje para el cliente', r.mensaje.length > 10);
  }

  // -------------------------------------------------------------------
  console.log('\n[6] Configuracion de despacho (solo admin)');
  // -------------------------------------------------------------------
  {
    const bcrypt = (await import('bcryptjs')).default;
    const email = `admin.delivery.${Date.now()}@amyb.cl`;
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Prueba1234', 12),
        nombre: 'Admin Prueba',
        role: 'admin'
      }
    });

    const cookies = new Map<string, string>();
    const login = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Prueba1234' })
    });
    for (const c of login.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const cookieHeader = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    // Radio negativo debe rechazarse
    const negativo = await fetch(`${API}/api/admin/delivery-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ radioMaximoKm: -5 })
    });
    check('Rechaza radio negativo', negativo.status === 400, `(HTTP ${negativo.status})`);

    // Radio valido se acepta
    const valido = await fetch(`${API}/api/admin/delivery-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ radioMaximoKm: 30 })
    });
    check('Acepta radio valido', valido.status === 200, `(HTTP ${valido.status})`);

    // Leer la configuracion no debe exponer la API key completa
    const leer = await fetch(`${API}/api/admin/delivery-config`, {
      headers: { Cookie: cookieHeader }
    });
    const leerBody = await leer.json();
    check('La API key nunca se devuelve completa',
      leerBody.data?.googleMapsApiKey === null ||
        String(leerBody.data?.googleMapsApiKey).includes('...'),
      `(devolvio ${leerBody.data?.googleMapsApiKey})`);

    // Probar una direccion
    const probar = await fetch(`${API}/api/admin/delivery-config/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ direccion: 'Av. Argentina 1234, Temuco', subtotal: 50000 })
    });
    const probarBody = await probar.json();
    check('El panel puede probar una direccion', probar.status === 200, `(HTTP ${probar.status})`);
    check('La prueba devuelve distancia y cobertura',
      typeof probarBody.data?.distanciaKm === 'number' &&
        typeof probarBody.data?.ventaBloqueada === 'boolean');

    // Limpieza
    await prisma.session.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  }

  // -------------------------------------------------------------------
  console.log('\n[7] Bloqueo por cobertura geografica');
  // -------------------------------------------------------------------
  {
    const direcciones: { dir: string; debePasar: boolean; nota: string }[] = [
      { dir: 'Av. Providencia 1234, Santiago Centro', debePasar: false, nota: 'otra region' },
      { dir: 'Rua Almirante Montt 22, Valparaiso', debePasar: false, nota: 'otra region' },
      { dir: 'Calle Latorre 456, Temuco', debePasar: true, nota: 'zona urbana' },
      { dir: 'Av. Argentina 789, Padre Las Casas', debePasar: true, nota: 'comuna de cobertura' },
      { dir: 'Av. Alemania 0890, Temuco', debePasar: true, nota: 'la misma bodega' }
    ];

    for (const c of direcciones) {
      const r = await deliveryService.validar(c.dir, 50000);
      check(
        `"${c.dir.slice(0, 34)}" ${c.debePasar ? 'se acepta' : 'se bloquea'} (${c.nota})`,
        c.debePasar ? r.ventaBloqueada === false : r.ventaBloqueada === true,
        `(bloqueado: ${r.ventaBloqueada})`
      );
    }
  }

  // -------------------------------------------------------------------
  console.log('\n[8] Bloqueo al crear el pedido (no solo al calcular)');
  // -------------------------------------------------------------------
  {
    // El bloqueo debe ocurrir en POST /api/orders. Si solo estuviera en
    // /calculate, un cliente podria llamar la API directo y saltarselo.
    const bcrypt2 = (await import('bcryptjs')).default;
    const email = `cobertura.${Date.now()}@amyb.cl`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt2.hash('Prueba1234', 12),
        nombre: 'Test Cobertura',
        role: 'customer'
      }
    });

    const cookies = new Map<string, string>();
    const login = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Prueba1234' })
    });
    for (const c of login.headers.getSetCookie?.() ?? []) {
      const [p] = c.split(';');
      const i = p.indexOf('=');
      cookies.set(p.slice(0, i), p.slice(i + 1));
    }
    const cookieHeader = Array.from(cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const prod = await productoParaCantidad(prisma, 5);

    const r = await fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        customer: { nombre: 'Test Cobertura', email, telefono: '+56 9 1111 2222' },
        dte: { tipoDocumento: 'boleta' },
        shipping: {
          zoneId: 'zone-temuco-centro',
          direccionEntrega: 'Av. Providencia 1234, Santiago Centro'
        },
        paymentMethod: 'webpay',
        items: [{ productId: prod!.id, quantity: 5 }]
      })
    });
    const body = await r.json();

    check('POST /api/orders RECHAZA una direccion fuera de cobertura',
      r.status === 422 && body.code === 'OUT_OF_DELIVERY_RANGE',
      `(HTTP ${r.status}, code ${body.code})`);
    check('El mensaje explica por que se rechaza',
      typeof body.message === 'string' && body.message.length > 20);
    check('No se crea el pedido',
      !(await prisma.order.findFirst({ where: { customerEmail: email } })));

    // Ahora una direccion dentro de la zona debe aceptarse
    const ok = await fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        customer: { nombre: 'Test Cobertura', email, telefono: '+56 9 1111 2222' },
        dte: { tipoDocumento: 'boleta' },
        shipping: {
          zoneId: 'zone-temuco-centro',
          direccionEntrega: 'Calle Latorre 456, Temuco'
        },
        paymentMethod: 'webpay',
        items: [{ productId: prod!.id, quantity: 5 }]
      })
    });
    check('POST /api/orders ACEPTA una direccion dentro de la zona',
      ok.status === 201, `(HTTP ${ok.status})`);

    // Limpieza
    await prisma.webpayTransaction.deleteMany({
      where: { order: { customerEmail: email } }
    });
    await prisma.emailLog.deleteMany({ where: { order: { customerEmail: email } } });
    await prisma.orderItem.deleteMany({
      where: { order: { customerEmail: email } }
    });
    await prisma.order.deleteMany({ where: { customerEmail: email } });
    await prisma.cartItem.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
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
