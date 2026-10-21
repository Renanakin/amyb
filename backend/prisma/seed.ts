/**
 * Seed de base de datos — Amyb Distribuidora
 *
 * Carga el catalogo inicial y las zonas de despacho de Temuco.
 * Ejecutar con:  npx prisma db seed
 *
 * Es idempotente: se puede correr varias veces sin duplicar registros.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Bodegas del negocio.
 *
 * El id es fijo y legible a proposito: aparece en las tablas, en el kardex
 * y en los pedidos, y tiene que ser reconocible al leerlo.
 *
 * QUE GENERA ESTOS DATOS: son datos fisicos del negocio, no configuracion
 * del sistema. La bodega central ya existia antes de la web y sus datos
 * son los que venia usando delivery_config (misma direccion, mismo radio).
 * Las coordenadas estan nullable porque se llenan al configurar Google
 * Maps: inventar una latitud para que el sistema "funcione" seria medir
 * contra un punto que no existe.
 */
const WAREHOUSES = {
  CENTRAL: {
    id: 'wh-central',
    code: 'CENTRAL',
    name: 'Bodega Central Temuco',
    address: 'Av. Alemania 0890, Temuco',
    lat: null as number | null,
    lng: null as number | null,
    isActive: true
  }
};

const PRODUCTS = [
  {
    sku: 'LAC-GB-1360',
    name: 'Queso Crema Green Bay',
    category: 'sushi',
    format: 'Barra 1.36 Kg',
    description:
      'Queso crema de alta consistencia termica ideal para rollos calientes (tempura/panko) y piezas frias. Textura untuosa sin desuerar.',
    price: 9490,
    originalPrice: 11000,
    discountPercent: 14,
    isOffer: true,
    stock: 45,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&w=600&q=80&fit=crop',
    badge: 'Oferta Semanal',
    brand: 'Green Bay',
    tiers: [
      { minQty: 20, unitPrice: 8990 },
      { minQty: 50, unitPrice: 8490 }
    ]
  },
  {
    sku: 'SAL-CZ-500U',
    name: 'Mayonesa Casera Carozzi Sachet',
    category: 'abarrotes',
    format: 'Caja Dispensadora 500u',
    description:
      'Sachets individuales de 8g con formulacion cremosa tradicional. Higiene y dosificacion exacta para delivery de pizzerias y hamburgueserias.',
    price: 15990,
    originalPrice: 19990,
    discountPercent: 20,
    isOffer: true,
    stock: 28,
    minWholesaleQty: 3,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&w=600&q=80&fit=crop',
    badge: 'Caja Cerrada',
    brand: 'Carozzi',
    tiers: [
      { minQty: 10, unitPrice: 14990 },
      { minQty: 30, unitPrice: 13990 }
    ]
  },
  {
    sku: 'CON-MAR-1000',
    name: 'Surtido de Mariscos IQF',
    category: 'congelados',
    format: 'Bolsa 1 Kg',
    description:
      'Mix congelado individualmente (IQF): choritos, machas, camaron y calamar. Listo para pailas marinas, empanadas y pastas.',
    price: 4900,
    originalPrice: 6500,
    discountPercent: 25,
    isOffer: true,
    stock: 60,
    minWholesaleQty: 10,
    image: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&w=600&q=80&fit=crop',
    badge: 'Congelado IQF',
    brand: 'Mar de Chile',
    tiers: [
      { minQty: 25, unitPrice: 4490 },
      { minQty: 60, unitPrice: 3990 }
    ]
  },
  {
    sku: 'LAC-PF-1360',
    name: 'Queso Crema Prairie Farms',
    category: 'sushi',
    format: 'Barra 1.36 Kg',
    description:
      'Queso crema de origen estadounidense preferido por sushi chefs por su suavidad y corte firme. Grado culinario superior.',
    price: 9990,
    originalPrice: 11490,
    discountPercent: 13,
    isOffer: false,
    stock: 35,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&w=600&q=80&fit=crop',
    badge: 'Favorito Chefs',
    brand: 'Prairie Farms',
    tiers: [{ minQty: 20, unitPrice: 9490 }]
  },
  {
    sku: 'LAC-COL-2500',
    name: 'Queso Mozzarella Barra Colun',
    category: 'lacteos',
    format: 'Barra 2.5 Kg',
    description:
      'Queso mozzarella chileno elaborado en el sur del pais. Optimo punto de fundido, gratinado dorado y hebra elastica para pizzas gourmet.',
    price: 18990,
    originalPrice: 21500,
    discountPercent: 12,
    isOffer: false,
    stock: 22,
    minWholesaleQty: 4,
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&w=600&q=80&fit=crop',
    badge: 'Hecho en el Sur',
    brand: 'Colun',
    tiers: [
      { minQty: 12, unitPrice: 17990 },
      { minQty: 30, unitPrice: 16990 }
    ]
  },
  {
    sku: 'ABA-ACE-5000',
    name: 'Aceite 100% Maravilla Chef Bidon 5L',
    category: 'abarrotes',
    format: 'Bidon 5 Litros',
    description:
      'Aceite refinado de alto rendimiento y resistencia termica para freidoras continuas. Sin sabor residual, ideal para fritura crocante.',
    price: 12490,
    originalPrice: 13990,
    discountPercent: 11,
    isOffer: false,
    stock: 50,
    minWholesaleQty: 4,
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&w=600&q=80&fit=crop',
    badge: 'Alto Rendimiento',
    brand: 'Chef',
    tiers: [{ minQty: 12, unitPrice: 11890 }]
  },
  {
    sku: 'SUSH-NOR-100',
    name: 'Alga Nori Gold Superior (100 Hojas)',
    category: 'sushi',
    format: 'Paquete 100 Hojas',
    description:
      'Alga tostada de calidad Gold con grosor uniforme, textura crujiente y aroma fresco. No se quiebra al enrollar sushi maki ni uramaki.',
    price: 13990,
    originalPrice: 15990,
    discountPercent: 12,
    isOffer: false,
    stock: 40,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?auto=format&w=600&q=80&fit=crop',
    badge: 'Calidad Gold',
    brand: 'Takaokaya',
    tiers: [{ minQty: 20, unitPrice: 13190 }]
  },
  {
    sku: 'SUSH-ARZ-5000',
    name: 'Arroz Grano Corto Koshihikari 5 Kg',
    category: 'sushi',
    format: 'Saco 5 Kg',
    description:
      'Arroz pulido especial para sushi. Excelente absorcion de vinagre sazonador y adherencia perfecta para shari.',
    price: 10890,
    originalPrice: 12500,
    discountPercent: 13,
    isOffer: false,
    stock: 30,
    minWholesaleQty: 4,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&w=600&q=80&fit=crop',
    badge: 'Grano Japones',
    brand: 'Koshi',
    tiers: [{ minQty: 10, unitPrice: 10290 }]
  },
  {
    sku: 'CON-SAL-1000',
    name: 'Filete de Salmon Premium IQF',
    category: 'congelados',
    format: 'Filete 1 Kg (Al Vacio)',
    description:
      'Salmon del sur de Chile, sin piel ni espinas, ultracongelado en origen. Grado sushi con carne firme y veteado uniforme.',
    price: 14500,
    originalPrice: 16990,
    discountPercent: 15,
    isOffer: true,
    stock: 18,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&w=600&q=80&fit=crop',
    badge: 'Grado Sushi',
    brand: 'Australis',
    tiers: [{ minQty: 10, unitPrice: 13800 }]
  },
  {
    sku: 'CON-PUL-1000',
    name: 'Pulpa de Frutilla 100% Natural 1 Kg',
    category: 'congelados',
    format: 'Bolsa 1 Kg',
    description:
      'Pulpa pura pasteurizada y congelada sin sugar anadida. Para cocteleria HORECA, jugos naturales y reposteria.',
    price: 3690,
    originalPrice: 4200,
    discountPercent: 12,
    isOffer: false,
    stock: 45,
    minWholesaleQty: 10,
    image: 'https://images.unsplash.com/photo-1543528176-61b239494933?auto=format&w=600&q=80&fit=crop',
    badge: '100% Fruta',
    brand: 'SurAndino',
    tiers: [
      { minQty: 24, unitPrice: 3390 },
      { minQty: 60, unitPrice: 3090 }
    ]
  },
  {
    sku: 'ENV-CT3-100',
    name: 'Caja Termica Hamburguesa CT3 (100u)',
    category: 'envases',
    format: 'Manga 100 Unidades',
    description:
      'Contenedor termico con cierre hermetico para hamburguesas y sandwiches calientes. Aislamiento termico que preserva temperatura.',
    price: 6890,
    originalPrice: 7990,
    discountPercent: 14,
    isOffer: false,
    stock: 75,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&w=600&q=80&fit=crop',
    badge: 'Apto Alimentos',
    brand: 'Darnel',
    tiers: [
      { minQty: 20, unitPrice: 6390 },
      { minQty: 50, unitPrice: 5890 }
    ]
  },
  {
    sku: 'ABA-SOY-1890',
    name: 'Salsa de Soya Tradicional Kikkoman 1.89L',
    category: 'sushi',
    format: 'Botella 1.89 Litros',
    description:
      'Salsa de soya naturalmente fermentada. Formato institucional para cocinas gastronomicas de alta rotacion.',
    price: 11990,
    originalPrice: 13500,
    discountPercent: 11,
    isOffer: false,
    stock: 32,
    minWholesaleQty: 3,
    image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&w=600&q=80&fit=crop',
    badge: 'Fermentacion Natural',
    brand: 'Kikkoman',
    tiers: [{ minQty: 12, unitPrice: 11290 }]
  }
];

const SHIPPING_ZONES = [
  {
    id: 'zone-temuco-centro',
    name: 'Temuco Centro & Poniente (Av. Alemania, Torremolinos, Los Pablos)',
    comuna: 'Temuco',
    cost: 2990,
    estimatedHours: 'Despacho en 24h',
    freeShippingThreshold: 35000
  },
  {
    id: 'zone-padre-las-casas',
    name: 'Padre Las Casas (Centro, Pulmahue y Villa Alegre)',
    comuna: 'Padre Las Casas',
    cost: 3490,
    estimatedHours: 'Despacho en 24h',
    freeShippingThreshold: 35000
  },
  {
    id: 'zone-labranza',
    name: 'Labranza & Salida Oeste',
    comuna: 'Temuco',
    cost: 3990,
    estimatedHours: 'Despacho en 24h - 48h',
    freeShippingThreshold: 45000
  },
  {
    id: 'zone-pueblo-nuevo',
    name: 'Pueblo Nuevo, Pedro de Valdivia & Santa Rosa',
    comuna: 'Temuco',
    cost: 2990,
    estimatedHours: 'Despacho en 24h',
    freeShippingThreshold: 35000
  },
  {
    id: 'zone-retiro-bodega',
    name: 'Retiro en Bodega Central Temuco (Sin Costo)',
    comuna: 'Temuco',
    cost: 0,
    estimatedHours: 'Listo en 2 horas',
    freeShippingThreshold: 0
  }
];

async function main() {
  console.log('[SEED] Iniciando carga de catalogo Amyb...\n');

  /** Quita acentos y pasa a minusculas, para la busqueda sin tildes. */
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  // --- Productos ---
  //
  // El seed arma el CATALOGO (precios, nombres, escalas). NO esdueño de
  // inventario: el stock de cada producto es un dato de la operacion, que
  // cambia con cada venta y cada compra.
  //
  // Antes el update incluia el stock, y como `prisma migrate dev` ejecuta
  // el seed solo al terminar, cada migracion reescribia products.stock con
  // el valor del catalogo mientras las bodegas seguian con el stock real.
  // El resultado era una cache desalineada que nadie habia notado.
  for (const p of PRODUCTS) {
    const { tiers, stock, ...data } = p;

    // create: el producto nuevo si nace con el stock del catalogo.
    // update: el stock NO se toca, porque es inventario vivo.
    const product = await prisma.product.upsert({
      where: { sku: data.sku },
      update: data,
      create: { ...data, stock: 0 }
    });

    // Campos derivados para busqueda
    await prisma.product.update({
      where: { id: product.id },
      data: {
        nameNormalized: normalize(data.name),
        skuNormalized: normalize(data.sku)
      }
    });

    // Price tiers: se borran y recrean para que reflejen el catalogo actual
    await prisma.priceTier.deleteMany({ where: { productId: product.id } });
    if (tiers.length > 0) {
      await prisma.priceTier.createMany({
        data: tiers.map((t) => ({ ...t, productId: product.id }))
      });
    }
    console.log(`  [OK] ${data.sku.padEnd(16)} ${data.name}`);
  }

  // --- Zonas de despacho ---
  console.log('');
  for (const z of SHIPPING_ZONES) {
    await prisma.shippingZone.upsert({
      where: { id: z.id },
      update: z,
      create: z
    });
    console.log(`  [OK] ${z.id}`);
  }

  // --- Bodegas ---
  // La bodega central es la que YA existe fisicamente: sus coordenadas y
  // su direccion son las que venia usando delivery_config. El stock actual
  // de cada producto pasa a ser el stock de esta bodega, con un asiento
  // de kardex que lo deja documentado como inventario inicial.
  console.log('');
  const bodegaCentral = await prisma.warehouse.upsert({
    where: { id: WAREHOUSES.CENTRAL.id },
    update: WAREHOUSES.CENTRAL,
    create: WAREHOUSES.CENTRAL
  });
  console.log(`  [OK] bodega ${bodegaCentral.code} - ${bodegaCentral.name}`);

  const productos = await prisma.product.findMany({ select: { id: true, sku: true, stock: true } });
  let migrados = 0;

  for (const p of productos) {
    const existente = await prisma.warehouseStock.findUnique({
      where: { warehouseId_productId: { warehouseId: bodegaCentral.id, productId: p.id } }
    });

    // No se pisa un stock que ya fue migrado: el seed se puede correr
    // varias veces y el kardex no se puede reescribir.
    if (existente) continue;

    // Producto recien creado por el seed: entra con el stock del
    // catalogo, como inventario inicial documentado.
    const cantidadInicial = PRODUCTS.find((x) => x.sku === p.sku)?.stock ?? 0;

    await prisma.warehouseStock.create({
      data: {
        warehouseId: bodegaCentral.id,
        productId: p.id,
        quantity: cantidadInicial,
        reserved: 0
      }
    });

    await prisma.stockMovement.create({
      data: {
        warehouseId: bodegaCentral.id,
        productId: p.id,
        type: 'entrada',
        quantity: cantidadInicial,
        balanceAfter: cantidadInicial,
        reason: 'Inventario inicial al cargar el catalogo',
        reference: 'seed'
      }
    });

    // La cache agregada queda al dia con la bodega recien creada.
    if (cantidadInicial !== p.stock) {
      await prisma.product.update({
        where: { id: p.id },
        data: { stock: cantidadInicial }
      });
    }

    migrados++;
  }
  console.log(`  [OK] ${migrados} producto(s) migrados a la bodega central con asiento de kardex`);

  // Las zonas quedan asignadas a la bodega central. Amyb puede mover una
  // zona a otra bodega desde el panel cuando abra el segundo punto.
  await prisma.shippingZone.updateMany({
    where: { warehouseId: null },
    data: { warehouseId: bodegaCentral.id }
  });

  const productCount = await prisma.product.count();
  const tierCount = await prisma.priceTier.count();
  const zoneCount = await prisma.shippingZone.count();
  const warehouseCount = await prisma.warehouse.count();

  console.log(
    `\n[SEED] Completado: ${productCount} productos, ${tierCount} escalas de precio, ` +
      `${zoneCount} zonas, ${warehouseCount} bodegas.`
  );
}

main()
  .catch((e) => {
    console.error('[SEED] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
