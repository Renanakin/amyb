/**
 * Pruebas del motor de precios por volumen (Fase 2).
 *
 * Ejecutar con el backend arriba:  npx tsx scripts/test-precios.ts
 *
 * Aqui se verifica el dinero: que el escalon B2B se aplique, que el
 * IVA cuadre y que el envio gratis respete el umbral. Un error aqui
 * significa cobrar de menos o de mas a un cliente real.
 */
import { PricingService, ProductForPricing, ShippingZoneForPricing } from '../src/services/pricingService.js';

const CHEESE: ProductForPricing = {
  id: 'p1',
  name: 'Queso Crema Green Bay',
  format: 'Barra 1.36 Kg',
  price: 9490,
  stock: 100,
  minWholesaleQty: 5,
  // Mismas escalas que el catalogo real
  priceTiers: [
    { minQty: 20, unitPrice: 8990 },
    { minQty: 50, unitPrice: 8490 }
  ]
};

const PRODUCTOS: ProductForPricing[] = [CHEESE];

const ZONAS: ShippingZoneForPricing[] = [
  { id: 'zone-temuco-centro', name: 'Temuco Centro', cost: 2990, freeShippingThreshold: 35000 },
  { id: 'zone-retiro', name: 'Retiro bodega', cost: 0, freeShippingThreshold: 0 }
];

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

const calc = (items: any[], zoneId = 'zone-temuco-centro', coupon?: string) =>
  PricingService.calculateCart(items, PRODUCTOS, ZONAS, zoneId, coupon);

console.log('=== PRUEBAS DEL MOTOR DE PRECIOS ===\n');

console.log('[1] Resolucion del precio unitario por escalon');
{
  const r1 = PricingService.resolveUnitPrice(CHEESE, 1);
  check('1 unidad -> precio de lista', r1.unitPrice === 9490, `(got ${r1.unitPrice})`);

  const r19 = PricingService.resolveUnitPrice(CHEESE, 19);
  check('19 unidades -> aun precio de lista', r19.unitPrice === 9490, `(got ${r19.unitPrice})`);

  const r20 = PricingService.resolveUnitPrice(CHEESE, 20);
  check('20 unidades -> primer escalon (8990)', r20.unitPrice === 8990, `(got ${r20.unitPrice})`);
  check('20 unidades marca el escalon aplicado', r20.appliedTier === 20);

  const r49 = PricingService.resolveUnitPrice(CHEESE, 49);
  check('49 unidades -> sigue en el escalon de 20', r49.unitPrice === 8990, `(got ${r49.unitPrice})`);

  const r50 = PricingService.resolveUnitPrice(CHEESE, 50);
  check('50 unidades -> segundo escalon (8490)', r50.unitPrice === 8490, `(got ${r50.unitPrice})`);

  const r200 = PricingService.resolveUnitPrice(CHEESE, 200);
  check('200 unidades -> segundo escalon', r200.unitPrice === 8490, `(got ${r200.unitPrice})`);
}

console.log('\n[2] Subtotal con escala aplicada');
{
  // 50 unidades a 8490 = 424.500 (no 50 x 9490 = 474.500)
  const c = calc([{ productId: 'p1', quantity: 50 }]);
  check('Subtotal 50 un. = 424.500', c.subtotal === 424500, `(got ${c.subtotal})`);
  check('Ahorro por volumen = 50.000', c.volumetricDiscount === 50000, `(got ${c.volumetricDiscount})`);
  check('Descuento por cupon es 0', c.descuento === 0);
}

console.log('\n[3] Desglose fiscal (IVA 19%)');
{
  const c = calc([{ productId: 'p1', quantity: 50 }]);
  // 424.500 / 1.19 = 356.722,68 -> redondeo a 356.723 ; IVA = 67.777
  // El IVA se calcula por diferencia (subtotal - neto) para que
  // neto + IVA cuadre exactamente con el subtotal, sin centavo perdido.
  check('Neto correcto', c.neto === 356723, `(got ${c.neto})`);
  check('IVA correcto', c.iva === 67777, `(got ${c.iva})`);
  check('Neto + IVA = subtotal', c.neto + c.iva === c.subtotal);
  check('Total = subtotal + envio', c.total === c.subtotal + c.costoEnvio);
}

console.log('\n[4] Envio gratis por monto');
{
  // 4 unidades = 37.960 -> supera el umbral de 35.000
  const c = calc([{ productId: 'p1', quantity: 4 }]);
  check('4 un. (37.960) -> envio gratis', c.envioGratis === true);
  check('costoEnvio = 0', c.costoEnvio === 0);

  // 3 unidades = 28.470 -> no llega al umbral de 35.000
  const c2 = calc([{ productId: 'p1', quantity: 3 }]);
  check('3 un. (28.470) -> NO hay envio gratis', c2.envioGratis === false);
  check('costoEnvio = 2.990', c2.costoEnvio === 2990);
  check('Faltante calculado (35.000-28.470)', c2.faltanteEnvioGratis === 6530, `(got ${c2.faltanteEnvioGratis})`);
}

console.log('\n[5] Retiro en bodega sin costo');
{
  const c = calc([{ productId: 'p1', quantity: 1 }], 'zone-retiro');
  check('Zona de retiro tiene costo 0', c.costoEnvio === 0);
  check('Total = solo productos', c.total === c.subtotal, `(${c.total} vs ${c.subtotal})`);
}

console.log('\n[6] Cupones');
{
  const c = calc([{ productId: 'p1', quantity: 10 }], 'zone-temuco-centro', 'AMYB10');
  // 10 x 9490 = 94.900 ; 10% = 9.490
  check('AMYB10 aplica 10%', c.descuento === 9490, `(got ${c.descuento})`);
  check('Total con cupon', c.total === 94900 - 9490 + c.costoEnvio, `(got ${c.total})`);

  const c2 = calc([{ productId: 'p1', quantity: 10 }], 'zone-temuco-centro', 'NOEXISTE');
  check('Cupon invalido no descuenta', c2.descuento === 0);
  check('Avisa que el cupon no es valido', c2.warnings.some((w) => w.includes('no es valido')));
}

console.log('\n[7] Producto inexistente y carrito vacio');
{
  const c = calc([{ productId: 'no-existe', quantity: 5 }]);
  check('No cobra por un producto inexistente', c.total === 0, `(got ${c.total})`);
  check('Tampoco cobra despacho por un carrito vacio', c.costoEnvio === 0, `(got ${c.costoEnvio})`);
  check('Avisa que se omite', c.warnings.length > 0);

  const c2 = calc([]);
  check('Carrito vacio total = 0', c2.total === 0, `(got ${c2.total})`);
}

console.log('\n[8] Minimo mayorista');
{
  const c = calc([{ productId: 'p1', quantity: 2 }]);
  check('2 unidades (minimo 5) genera aviso', c.warnings.some((w) => w.includes('minimo mayorista')));
  check('Item marcado como bajo minimo', c.itemsResolved[0].belowMinimum === true);

  const c2 = calc([{ productId: 'p1', quantity: 5 }]);
  check('5 unidades ya no genera aviso', !c2.warnings.some((w) => w.includes('minimo mayorista')));
}

console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===`);
if (fail > 0) process.exitCode = 1;
