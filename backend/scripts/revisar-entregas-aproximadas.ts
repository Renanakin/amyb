/**
 * Ventas cuya cobertura de entrega se aprobo sin poder verificarse.
 *
 * Sin la API de Google, el radio de 30 km se mide en LINEA RECTA. La
 * distancia real por camino es siempre mayor: en la practica entre 1,2 y
 * 1,4 veces. Un pedido a 28 km en linea recta puede ser 38 km de viaje, y
 * se aprobo.
 *
 * Eso no es un error del sistema: es la consecuencia honesta de no tener
 * el servicio configurado, y el sistema lo marca como aproximado en vez
 * de fingir que verifico. Lo que faltaba era poder ver, a fin de mes, a
 * quien se le cobro con una medicion que no era la real.
 *
 * Ejecutar: npx tsx scripts/revisar-entregas-aproximadas.ts
 */
import { prisma } from '../src/lib/prisma.js';

async function run() {
  const config = await prisma.deliveryConfig.findUnique({
    where: { id: 'default' }
  });

  const tieneGoogle = Boolean(config?.googleMapsApiKey);

  console.log('\n=== VENTAS APROBADAS SIN VERIFICAR COBERTURA ===\n');

  console.log(
    `  Google Maps: ${
      tieneGoogle
        ? 'configurado (las distancias son reales)'
        : 'SIN CONFIGURAR: las distancias son en linea recta y subestiman la real'
    }`
  );
  console.log(
    `  Radio configurado: ${config?.radioMaximoKm ?? '?'} km (en linea recta)\n`
  );

  const aproximadas = await prisma.order.findMany({
    where: { entregaAproximada: true },
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  console.log(`  Pedidos con cobertura aproximada: ${aproximadas.length}\n`);

  if (aproximadas.length === 0) {
    console.log('  Ninguno.\n');
    return;
  }

  // Con linea recta subestimada, estos son los que mas lejos estan y por
  // lo tanto los mas expuestos a haberse pasado del radio real.
  const radio = config?.radioMaximoKm ?? 30;
  const sospechosos = aproximadas
    .filter((o) => o.distanciaEntregaKm != null && o.distanciaEntregaKm >= radio * 0.6)
    .sort((a, b) => (b.distanciaEntregaKm ?? 0) - (a.distanciaEntregaKm ?? 0));

  console.log('  --- Mas expuestos (cercanos al limite del radio) ---');
  if (sospechosos.length === 0) {
    console.log('    Ninguno.\n');
  }
  for (const o of sospechosos) {
    const km = o.distanciaEntregaKm!;
    // Rango tipico de ruta real respecto de la linea recta.
    console.log(
      `  ${o.orderNumber}  ${km.toFixed(1)} km en linea recta  ` +
        `(ruta real estimada: ${(km * 1.2).toFixed(0)}-${(km * 1.4).toFixed(0)} km)  ` +
        `${o.paymentStatus}`
    );
    console.log(`     ${o.customerNombre} - ${o.shippingAddress}`);
  }

  console.log(
    `\n  Que hacer: cargar GOOGLE_MAPS_API_KEY y revisar estos pedidos antes de ` +
      `despachar. La venta no se cae sola: el sistema la acepto y por eso hay ` +
      `que mirarla a mano.\n`
  );
}

run()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });