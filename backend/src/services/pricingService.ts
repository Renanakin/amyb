import { OrderItemPayload } from '../types/index.js';

/**
 * Motor de precios del servidor.
 *
 * REGLA DE ORO: el precio SIEMPRE se calcula aqui, nunca en el frontend.
 * Si el navegador dijera el monto a cobrar, un cliente podria alterarlo
 * y pagar menos. Por eso el checkout recalcula en el backend y el total
 * que se cobra es el que sale de este servicio.
 */

export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

export interface ProductForPricing {
  id: string;
  name: string;
  format: string;
  price: number;
  stock: number;
  minWholesaleQty: number;
  priceTiers: PriceTier[];
}

export interface ResolvedItem {
  product: ProductForPricing;
  quantity: number;
  unitPrice: number; // precio unitario YA aplicado el escalon y el descuento
  listPrice: number; // precio de lista publico, para mostrar el ahorro
  savings: number; // cuanto se ahorra por volumen y por nivel
  appliedTier: number | null; // desde que cantidad se aplico el escalon
  subtotal: number;
  belowMinimum: boolean; // cantidad menor al minimo mayorista
  minWholesaleQty: number;
  // Precio antes del descuento de nivel, para transparency en el panel
  priceBeforeCustomerDiscount: number;
}

/**
 * Nivel de precio del cliente.
 *
 * Define el descuento que un cliente ve sobre TODA la tienda. Sin
 * nivel asignado, el cliente ve los precios de lista publicos.
 */
export interface CustomerPriceTier {
  id: string;
  nombre: string;
  descuentoPercent: number; // ej. 8.5 = 8,5%
  aplicaSobreEscalon: boolean;
}

export interface ShippingZoneForPricing {
  id: string;
  name: string;
  cost: number;
  freeShippingThreshold: number;
}

export interface CalculationResult {
  subtotal: number;
  descuento: number;
  volumetricDiscount: number;
  customerDiscount: number; // descuento por nivel de cliente
  iva: number;
  neto: number;
  costoEnvio: number;
  envioGratis: boolean;
  faltanteEnvioGratis: number;
  total: number;
  itemsResolved: ResolvedItem[];
  warnings: string[];
  // Datos del nivel aplicado, para que el frontend muestre la etiqueta
  customerTier: { id: string; nombre: string; descuento: number } | null;
}

/** Cupones validos. En produccion deberian vivir en la base de datos. */
const COUPONS: Record<string, { percent: number; label: string }> = {
  AMYB10: { percent: 10, label: 'Bienvenida Amyb' },
  BIENVENIDA: { percent: 10, label: 'Bienvenida Amyb' },
  HORECA2026: { percent: 15, label: 'Descuento HORECA 2026' }
};

export class PricingService {
  /**
   * Resuelve el precio unitario de un producto segun la cantidad.
   *
   * Logica de escalas: se toma el escalon mas alto cuya cantidad minima
   * sea <= la cantidad pedida. Ejemplo con tiers [{20: 8990}, {50: 8490}]:
   *   -  5 unidades -> precio de lista
   *   - 25 unidades -> 8.990 (cumple el escalon de 20)
   *   - 60 unidades -> 8.490 (cumple el escalon de 50)
   */
  static resolveUnitPrice(
    product: ProductForPricing,
    quantity: number
  ): { unitPrice: number; listPrice: number; appliedTier: number | null } {
    const listPrice = product.price;

    const tiers = [...(product.priceTiers ?? [])].sort(
      (a, b) => b.minQty - a.minQty // de mayor a menor
    );

    for (const tier of tiers) {
      if (quantity >= tier.minQty) {
        return {
          unitPrice: tier.unitPrice,
          listPrice,
          appliedTier: tier.minQty
        };
      }
    }

    return { unitPrice: listPrice, listPrice, appliedTier: null };
  }

  /**
   * Calcula el total del carrito.
   *
   * @param items        productos y cantidades pedidas
   * @param products     catalogo con sus escalas de precio
   * @param zones        zonas de despacho
   * @param zoneId       zona elegida
   * @param couponCode   codigo de descuento opcional
   */
  static calculateCart(
    items: OrderItemPayload[],
    products: ProductForPricing[],
    zones: ShippingZoneForPricing[],
    zoneId: string,
    couponCode?: string,
    customerTier?: CustomerPriceTier | null
  ): CalculationResult {
    let subtotal = 0;
    let volumetricDiscount = 0;
    let customerDiscount = 0;
    const itemsResolved: ResolvedItem[] = [];
    const warnings: string[] = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        // Producto inexistente: se ignora en vez de cobro un precio inventado
        warnings.push(
          `El producto "${item.productId}" ya no esta disponible y se omito del calculo.`
        );
        continue;
      }

      const { unitPrice: precioPorVolumen, listPrice, appliedTier } =
        PricingService.resolveUnitPrice(product, item.quantity);

      // Paso 2: descuento del nivel de cliente.
      //
      // Se aplica SOBRE el precio ya escalonado, no sobre el de lista.
      // Si se aplicara sobre el de lista, el cliente especial perderia
      // el beneficio del volumen, que es justo lo que lo trae a la
      // plataforma. Configurable con aplicaSobreEscalon por si el
      // negocio prefiere el otro criterio.
      const baseDescuento = customerTier?.aplicaSobreEscalon
        ? precioPorVolumen
        : listPrice;

      const precioConDescuento =
        customerTier && customerTier.descuentoPercent > 0
          ? Math.round(baseDescuento * (1 - customerTier.descuentoPercent / 100))
          : precioPorVolumen;

      // El descuento nunca puede dejar el producto en cero: una venta
      // gratuita rompe la contabilidad de inventario y la facturacion.
      const unitPrice = Math.max(1, precioConDescuento);

      const itemSubtotal = unitPrice * item.quantity;
      // El ahorro total se mide contra el precio de lista publico
      const itemSavings = (listPrice - unitPrice) * item.quantity;

      subtotal += itemSubtotal;
      volumetricDiscount += (listPrice - precioPorVolumen) * item.quantity;
      // El descuento del cliente es la DIFERENCIA entre lo que habria
      // pagado por el escalon de volumen y lo que paga con su nivel.
      // Sin el Math.max, cuando aplicaSobreEscalon=false el precio final
      // puede quedar por ENCIMA del escalon y daria negativo.
      customerDiscount +=
        Math.max(0, precioPorVolumen - unitPrice) * item.quantity;

      // Aviso cuando la cantidad no llega al minimo mayorista del producto
      const belowMinimum =
        item.quantity < product.minWholesaleQty && product.minWholesaleQty > 1;
      if (belowMinimum) {
        warnings.push(
          `"${product.name}": minimo mayorista ${product.minWholesaleQty} unidades (pediste ${item.quantity}).`
        );
      }

      itemsResolved.push({
        product,
        quantity: item.quantity,
        unitPrice,
        listPrice,
        savings: itemSavings,
        appliedTier,
        subtotal: itemSubtotal,
        belowMinimum,
        minWholesaleQty: product.minWholesaleQty,
        priceBeforeCustomerDiscount: precioPorVolumen
      });
    }

    // --- Descuento por cupon (se aplica sobre el subtotal ya escalonado) ---
    let descuento = 0;
    if (couponCode) {
      const normalized = couponCode.trim().toUpperCase();
      const coupon = COUPONS[normalized];
      if (coupon) {
        descuento = Math.round(subtotal * (coupon.percent / 100));
      } else {
        warnings.push(`El cupon "${couponCode}" no es valido y no se aplico.`);
      }
    }

    // --- Envio ---
    const selectedZone =
      zones.find((z) => z.id === zoneId) ?? zones[0] ?? {
        id: 'default',
        name: 'Sin zona definida',
        cost: 0,
        freeShippingThreshold: 0
      };

    const threshold = selectedZone.freeShippingThreshold;
    const subtotalConDescuento = Math.max(0, subtotal - descuento);

    let costoEnvio = selectedZone.cost;
    let envioGratis = false;
    let faltanteEnvioGratis = Math.max(0, threshold - subtotalConDescuento);

    if (subtotalConDescuento <= 0) {
      // Carrito vacio o sin productos validos: no se cobra despacho.
      // Sin este caso, un pedido sin productos facturaba el costo de
      // envio igual, que es un cobro sin contraprestacion.
      costoEnvio = 0;
      envioGratis = false;
      faltanteEnvioGratis = threshold;
    } else if (selectedZone.cost === 0) {
      // Retiro en bodega o zona sin costo
      costoEnvio = 0;
      envioGratis = true;
      faltanteEnvioGratis = 0;
    } else if (threshold > 0 && subtotalConDescuento >= threshold) {
      costoEnvio = 0;
      envioGratis = true;
      faltanteEnvioGratis = 0;
    }

    // --- Desglose fiscal ---
    // En Chile el precio de vitrina al consumidor incluye IVA.
    // Para emitir DTE hay que separar el neto y el IVA (19%).
    const neto = Math.round(subtotalConDescuento / 1.19);
    const iva = subtotalConDescuento - neto;
    const total = subtotalConDescuento + costoEnvio;

    return {
      subtotal,
      descuento,
      volumetricDiscount,
      customerDiscount,
      iva,
      neto,
      costoEnvio,
      envioGratis,
      faltanteEnvioGratis,
      total,
      itemsResolved,
      warnings,
      customerTier:
        customerTier && customerTier.descuentoPercent > 0
          ? {
              id: customerTier.id,
              nombre: customerTier.nombre,
              descuento: customerTier.descuentoPercent
            }
          : null
    };
  }
}
