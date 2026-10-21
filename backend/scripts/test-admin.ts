/**
 * Pruebas del panel de administracion.
 *
 * Ejecutar: npx tsx scripts/test-admin.ts
 *
 * Lo mas importante aqui NO es que las rutas funcionen, sino que NO
 * funcionen para quien no debe. Un panel admin abierto a un cliente
 * permitiria cambiar precios o cancelar pedidos ajenos.
 */
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';

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
  console.log('=== PRUEBAS DEL PANEL ADMIN ===\n');

  // Crear un admin y un cliente de prueba con contrasenas conocidas
  const adminEmail = `test.admin.${Date.now()}@amyb.cl`;
  const clienteEmail = `test.cliente.${Date.now()}@amyb.cl`;
  const password = 'PruebaAdmin123';

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(password, 12),
      nombre: 'Admin de Prueba',
      role: 'admin'
    }
  });
  const cliente = await prisma.user.create({
    data: {
      email: clienteEmail,
      passwordHash: await bcrypt.hash(password, 12),
      nombre: 'Cliente de Prueba',
      role: 'customer'
    }
  });

  // Contenedor de cookies, uno por sesion simulada
  const jars: Record<string, Map<string, string>> = {
    admin: new Map<string, string>(),
    cliente: new Map<string, string>()
  };

  async function call(
    path: string,
    quien: 'admin' | 'cliente' | 'anonimo',
    method = 'GET',
    body?: any
  ) {
    const jar = jars[quien] ?? new Map<string, string>();
    const header = Array.from(jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(header ? { Cookie: header } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx);
      const val = pair.slice(idx + 1);
      if (val === '') jar.delete(name);
      else jar.set(name, val);
    }

    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  // -------------------------------------------------------------------
  console.log('[1] Control de acceso (lo mas critico)');
  // -------------------------------------------------------------------
  {
    const anonimo = await call('/api/admin/dashboard', 'anonimo');
    check('Anonimo NO puede ver el dashboard', anonimo.status === 401, `(HTTP ${anonimo.status})`);

    const anonCreate = await call('/api/admin/products', 'anonimo', 'POST', {
      sku: 'HACK-001', name: 'Hack', category: 'sushi', price: 1
    });
    check('Anonimo NO puede crear productos', anonCreate.status === 401, `(HTTP ${anonCreate.status})`);

    const anonOrders = await call('/api/admin/orders', 'anonimo');
    check('Anonimo NO puede ver pedidos', anonOrders.status === 401, `(HTTP ${anonOrders.status})`);
  }

  // Login como cliente normal
  const loginCliente = await call('/api/auth/login', 'cliente', 'POST', {
    email: clienteEmail,
    password
  });
  check('Cliente puede iniciar sesion', loginCliente.status === 200, `(HTTP ${loginCliente.status})`);

  {
    const r = await call('/api/admin/dashboard', 'cliente');
    check('Cliente NORMAL recibe 403 (no 401, si esta autenticado)',
      r.status === 403, `(HTTP ${r.status})`);

    const r2 = await call('/api/admin/orders', 'cliente');
    check('Cliente NO puede listar pedidos', r2.status === 403, `(HTTP ${r2.status})`);

    const r3 = await call('/api/admin/products', 'cliente', 'POST', {
      sku: 'HACK-002', name: 'Hack', category: 'sushi', price: 1
    });
    check('Cliente NO puede crear productos', r3.status === 403, `(HTTP ${r3.status})`);

    const r4 = await call('/api/admin/clients', 'cliente');
    check('Cliente NO puede ver la lista de clientes', r4.status === 403, `(HTTP ${r4.status})`);
  }

  // -------------------------------------------------------------------
  console.log('\n[2] Acceso del administrador');
  // -------------------------------------------------------------------
  const loginAdmin = await call('/api/auth/login', 'admin', 'POST', {
    email: adminEmail,
    password
  });
  check('Admin puede iniciar sesion', loginAdmin.status === 200, `(HTTP ${loginAdmin.status})`);

  {
    const dash = await call('/api/admin/dashboard', 'admin');
    check('Admin ve el dashboard', dash.status === 200, `(HTTP ${dash.status})`);
    check('El dashboard trae ventas de hoy', typeof dash.body?.data?.ventas?.hoy === 'number');
    check('El dashboard trae pedidos de hoy', typeof dash.body?.data?.pedidos?.hoy === 'number');
    check('El dashboard cuenta productos activos',
      typeof dash.body?.data?.catalogo?.productosActivos === 'number');
    check('El dashboard avisa productos con stock bajo',
      typeof dash.body?.data?.catalogo?.stockBajo === 'number');
  }

  // -------------------------------------------------------------------
  console.log('\n[3] CRUD de productos');
  // -------------------------------------------------------------------
  let productoCreado: any = null;
  {
    const sku = `TEST-${Date.now().toString().slice(-6)}`;

    const creado = await call('/api/admin/products', 'admin', 'POST', {
      sku,
      name: 'Producto de Prueba Admin',
      category: 'sushi',
      format: 'Caja 10 unidades',
      price: 5000,
      stock: 100,
      minWholesaleQty: 2,
      brand: 'Test',
      priceTiers: [
        { minQty: 10, unitPrice: 4500 },
        { minQty: 50, unitPrice: 4000 }
      ]
    });
    check('Admin crea un producto', creado.status === 201, `(HTTP ${creado.status})`);
    productoCreado = creado.body?.data;
    check('El SKU se normaliza a mayusculas', productoCreado?.sku === sku.toUpperCase());

    // El nombre sin acentos debe guardarse para la busqueda
    const conTilde = await call('/api/admin/products', 'admin', 'POST', {
      sku: `${sku}-T`,
      name: 'Jalapeños Premium',
      category: 'abarrotes',
      price: 3000,
      stock: 10
    });
    check('Producto con tilde se crea', conTilde.status === 201, `(HTTP ${conTilde.status})`);

    // Busqueda sin acentos
    const busca = await call('/api/admin/products?search=jalapeno', 'admin');
    check('Busca "jalapeno" y encuentra "Jalapeños"',
      busca.body?.data?.some((p: any) => p.name.includes('Jalapeños')),
      `(encontro ${busca.body?.count})`);

    // SKU duplicado
    const dup = await call('/api/admin/products', 'admin', 'POST', {
      sku, name: 'Duplicado', category: 'sushi', price: 100
    });
    check('Rechaza SKU duplicado', dup.status === 409, `(HTTP ${dup.status})`);

    // Validaciones
    const sinPrecio = await call('/api/admin/products', 'admin', 'POST', {
      sku: `${sku}-X`, name: 'Sin precio', category: 'sushi'
    });
    check('Rechaza producto sin precio', sinPrecio.status === 400, `(HTTP ${sinPrecio.status})`);
  }

  {
    // Editar
    const editado = await call(`/api/admin/products/${productoCreado.id}`, 'admin', 'PUT', {
      price: 5500,
      stock: 42,
      priceTiers: [
        { minQty: 10, unitPrice: 5000 },
        { minQty: 40, unitPrice: 4500 }
      ]
    });
    check('Admin edita un producto', editado.status === 200, `(HTTP ${editado.status})`);
    check('El precio quedo actualizado', editado.body?.data?.price === 5500);

    // Las escalas se reemplazan. Se consulta por el endpoint de ADMIN
    // (el publico devuelve un DTO reducido, sin escalas anidadas).
    const conEscalas = await call('/api/admin/products', 'admin');
    const mine = conEscalas.body?.data?.find((p: any) => p.id === productoCreado.id);
    const escalas = mine?.priceTiers ?? [];
    check('Las escalas B2B se guardaron', escalas.length === 2, `(tiene ${escalas.length})`);
    check('La escala de 10 unidades quedo en 5.000',
      escalas.some((t: any) => t.minQty === 10 && t.unitPrice === 5000));
    check('La escala de 40 unidades quedo en 4.500',
      escalas.some((t: any) => t.minQty === 40 && t.unitPrice === 4500));

    // Ajuste rapido de stock
    const stock = await call(`/api/admin/products/${productoCreado.id}/stock`, 'admin', 'PATCH', {
      stock: 7
    });
    check('Admin ajusta el stock', stock.status === 200, `(HTTP ${stock.status})`);
    check('El stock quedo en 7', stock.body?.data?.stockNuevo === 7);

    const stockInvalido = await call(`/api/admin/products/${productoCreado.id}/stock`, 'admin', 'PATCH', {
      stock: -5
    });
    check('Rechaza stock negativo', stockInvalido.status === 400, `(HTTP ${stockInvalido.status})`);

    // Dar de baja
    const baja = await call(`/api/admin/products/${productoCreado.id}`, 'admin', 'DELETE');
    check('Admin da de baja el producto', baja.status === 200, `(HTTP ${baja.status})`);
    check('El producto queda inactivo, no borrado', baja.body?.data?.isActive === false);

    // Reactivar
    const activa = await call(`/api/admin/products/${productoCreado.id}/reactivate`, 'admin', 'POST');
    check('Admin reactiva el producto', activa.status === 200, `(HTTP ${activa.status})`);
  }

  // -------------------------------------------------------------------
  console.log('\n[4] Gestion de pedidos');
  // -------------------------------------------------------------------
  {
    const pedidos = await call('/api/admin/orders', 'admin');
    check('Admin lista los pedidos', pedidos.status === 200, `(HTTP ${pedidos.status})`);
    check('El listado trae el total de pedidos', typeof pedidos.body?.total === 'number');

    // Filtro por estado de pago
    const pagados = await call('/api/admin/orders?paymentStatus=pagado', 'admin');
    check(
      'El filtro por pago funciona',
      pagados.body?.data?.every((o: any) => o.paymentStatus === 'pagado')
    );

    // Buscar por numero de pedido
    if (pedidos.body?.data?.length > 0) {
      const primero = pedidos.body.data[0];
      const busca = await call(`/api/admin/orders?search=${primero.orderNumber}`, 'admin');
      check('Busca por numero de pedido',
        busca.body?.data?.some((o: any) => o.orderNumber === primero.orderNumber));

      // Cambiar estado logistico
      if (primero.paymentStatus === 'pagado') {
        const despacha = await call(`/api/admin/orders/${primero.orderId}/status`, 'admin', 'PATCH', {
          orderStatus: 'despachado'
        });
        check('Admin marca un pedido pagado como despachado',
          despacha.status === 200, `(HTTP ${despacha.status}) ${despacha.body?.message ?? ''}`);
      }
    }

    // Regla de negocio: no despachar algo no pagado
    const pendientes = await call('/api/admin/orders?paymentStatus=pendiente', 'admin');
    if (pendientes.body?.data?.length > 0) {
      const noPagado = pendientes.body.data[0];
      const intento = await call(`/api/admin/orders/${noPagado.orderId}/status`, 'admin', 'PATCH', {
        orderStatus: 'despachado'
      });
      check('NO permite despachar un pedido impago', intento.status === 409, `(HTTP ${intento.status})`);
    }

    // Estado invalido
    const invalido = await call('/api/admin/orders/inexistente/status', 'admin', 'PATCH', {
      orderStatus: 'inventado'
    });
    check('Rechaza un estado que no existe', invalido.status === 400, `(HTTP ${invalido.status})`);

    // No se puede tocar el estado de pago
    const cambiaPago = await call(
      `/api/admin/orders/${pedidos.body?.data?.[0]?.orderId}/status`,
      'admin',
      'PATCH',
      { paymentStatus: 'pagado' }
    );
    check('El endpoint de estado NO acepta cambiar el pago',
      cambiaPago.status >= 400 || cambiaPago.body?.message?.includes('invalido'),
      `(HTTP ${cambiaPago.status})`);
  }

  // -------------------------------------------------------------------
  console.log('\n[5] Clientes');
  // -------------------------------------------------------------------
  {
    const clientes = await call('/api/admin/clients', 'admin');
    check('Admin ve los clientes', clientes.status === 200, `(HTTP ${clientes.status})`);
    check(
      'La lista NO incluye al admin',
      !clientes.body?.data?.some((c: any) => c.email === adminEmail)
    );
    check(
      'La lista incluye el total comprado por cliente',
      clientes.body?.data?.every((c: any) => typeof c.totalComprado === 'number')
    );
  }

  // -------------------------------------------------------------------
  console.log('\n[6] Aislamiento entre datos');
  // -------------------------------------------------------------------
  {
    // Un pedido creado por el cliente no debe ser visible para otro
    const productosPublicos = await fetch(`${API}/api/products`).then((r) => r.json());
    check('El catalogo publico sigue funcionando', productosPublicos.success === true);
    check('El catalogo publico no expone el campo isActive',
      productosPublicos.data.every((p: any) => p.isActive === undefined));
  }

  // Limpieza
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, cliente.id] } } });
  await prisma.product.deleteMany({
    where: { sku: { startsWith: `TEST-${Date.now().toString().slice(-6)}` } }
  });

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
