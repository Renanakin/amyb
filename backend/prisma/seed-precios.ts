/**
 * Datos iniciales de niveles de precio y configuracion de despacho.
 *
 * Ejecutar: npx tsx prisma/seed-precios.ts
 *
 * Es idempotente: se puede correr varias veces sin duplicar.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Niveles propuestos. Se ajustan segun la politica comercial real.
 *
 * El descuento se aplica SOBRE el precio ya escalonado por volumen
 * (por defecto), para que un cliente mayorista no pierda el beneficio
 * de comprar en cantidad.
 */
const NIVELES = [
  {
    nombre: 'Cliente Mayorista',
    descripcion: 'Clientes con compras recurrentes en volumen. Mayorista con 8% de descuento sobre el precio ya negociado por escala.',
    descuentoPercent: 8,
    aplicaSobreEscalon: true,
    color: '#F58220'
  },
  {
    nombre: 'Cliente Preferencial',
    descripcion: 'Clientes con acuerdo comercial. 4% de descuento.',
    descuentoPercent: 4,
    aplicaSobreEscalon: true,
    color: '#1565A8'
  },
  {
    nombre: 'Cliente Distribuidor',
    descripcion: 'Distribuidores y cadenas con alto volumen. 12% de descuento.',
    descuentoPercent: 12,
    aplicaSobreEscalon: true,
    color: '#0B3C73'
  }
];

const DELIVERY = {
  id: 'default',
  nombreLocal: 'Amyb Distribuidora - Bodega Central',
  // Direccion de la bodega, punto de partida de todas las rutas
  bodegaDireccion: 'Av. Alemania 0890, Temuco, Region de La Araucania',
  // Radio maximo de entrega en linea recta
  radioMaximoKm: 30,
  // Si es true, la venta fuera del radio se bloquea
  bloquearFueraDeRadio: true,
  despachoBase: 2990,
  costoPorKm: 150,
  despachoGratisDesde: 35000
};

async function main() {
  console.log('\n[SEED] Niveles de precio y configuracion de despacho\n');

  for (const n of NIVELES) {
    const nivel = await prisma.priceTierCustomer.upsert({
      where: { nombre: n.nombre },
      update: n,
      create: n
    });
    console.log(`  [OK] ${n.nombre.padEnd(24)} -${n.descuentoPercent}%`);
    void nivel;
  }

  await prisma.deliveryConfig.upsert({
    where: { id: DELIVERY.id },
    update: DELIVERY,
    create: DELIVERY
  });

  console.log(`\n  [OK] Radio de entrega: ${DELIVERY.radioMaximoKm} km`);
  console.log(`  [OK] Bloquea fuera del radio: ${DELIVERY.bloquearFueraDeRadio ? 'SI' : 'NO'}`);
  console.log(`  [OK] Despacho base: $${DELIVERY.despachoBase} + $${DELIVERY.costoPorKm}/km`);
  console.log(`  [OK] Despacho gratis desde: $${DELIVERY.despachoGratisDesde}\n`);

  console.log('  Para activar Google Maps, configura la API Key desde:');
  console.log('    Panel admin > Configuracion > Despacho\n');
}

main()
  .catch((e) => {
    console.error('[SEED] Error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
