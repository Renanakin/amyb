import { Product } from '../types';

/**
 * Precio unitario que corresponde a una cantidad dada.
 *
 * Replica la logica del servidor (pricingService.resolveUnitPrice):
 * aplica el escalon mas alto cuya cantidad minima se cumple.
 *
 * IMPORTANTE: esto es solo para MOSTRAR el precio. El monto que se
 * cobra lo recalcula el backend al crear el pedido. Si estas funciones
 * quedaran desalineadas, el cliente veria un total y Transbank
 * cobraria otro.
 */
export function precioUnitario(product: Product, quantity: number): number {
  const tiers = [...(product.priceTiers ?? [])].sort((a, b) => b.minQty - a.minQty);
  for (const t of tiers) {
    if (quantity >= t.minQty) return t.unitPrice;
  }
  return product.price;
}

/** Siguiente escalon por alcanzar, para avisar cuanto falta. */
export function siguienteEscalon(
  product: Product,
  quantity: number
): { minQty: number; unitPrice: number } | null {
  const tiers = [...(product.priceTiers ?? [])].sort((a, b) => a.minQty - b.minQty);
  for (const t of tiers) {
    if (quantity < t.minQty) return t;
  }
  return null;
}

/** Cantidad que le falta al cliente para el siguiente precio. */
export function unidadesParaSiguienteEscalon(product: Product, quantity: number): number {
  const next = siguienteEscalon(product, quantity);
  return next ? next.minQty - quantity : 0;
}

/**
 * Cantidad con la que se agrega un producto al carrito desde un boton
 * "Anadir" que no tiene selector.
 *
 * Si el producto tiene minimo mayorista, se agrega ese minimo y no 1:
 * de lo contrario la operacion se rechaza y el cliente ve un error
 * inexplicable, porque el mismo producto se puede comprar en la ficha
 * con el minimo correcto.
 */
export function cantidadInicial(product: Product): number {
  return product.minWholesaleQty > 1 ? product.minWholesaleQty : 1;
}

/**
 * Aplica el descuento del nivel de cliente sobre un precio.
 *
 * COPIA EXACTA de la logica del servidor (PricingService):
 * primero el escalon de volumen, despues el descuento del nivel.
 *
 * IMPORTANTE: esto es solo para MOSTRAR el precio. El monto que se
 * cobra lo recalcula el backend al crear el pedido. Si estas funciones
 * quedaran desalineadas, el cliente veria un total distinto al que
 * Transbank le cobra.
 */
export function precioConNivelCliente(
  product: Product,
  quantity: number,
  nivel: { descuentoPercent: number; aplicaSobreEscalon: boolean } | null
): number {
  const precioVolumen = precioUnitario(product, quantity);
  if (!nivel || nivel.descuentoPercent <= 0) return precioVolumen;

  const base = nivel.aplicaSobreEscalon ? precioVolumen : product.price;
  const conDescuento = Math.round(base * (1 - nivel.descuentoPercent / 100));
  return Math.max(1, conDescuento);
}

/** El precio unitario que el cliente ve, con su nivel aplicado. */
export function precioMostrado(
  product: Product,
  quantity: number,
  nivel: { descuentoPercent: number; aplicaSobreEscalon: boolean } | null
): number {
  return precioConNivelCliente(product, quantity, nivel);
}
