export type ProductCategory = 'sushi' | 'lacteos' | 'abarrotes' | 'congelados' | 'envases' | 'todos';

/**
 * Escala de precio por volumen (B2B).
 * "Desde 20 unidades, el precio baja a $8.990".
 * El servidor es quien decide que escala aplica; el frontend solo la
 * muestra para que el cliente vea cuanto ahorra al comprar más.
 */
export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  categoryName: string;
  format: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  isOffer?: boolean;
  stock: number;
  minWholesaleQty: number;
  image: string;
  badge?: string;
  brand: string;
  priceTiers?: PriceTier[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface DteInvoiceData {
  tipoDocumento: 'boleta' | 'factura';
  rutEmpresa?: string;
  razonSocial?: string;
  giroComercial?: string;
  direccionTributaria?: string;
  comunaTributaria?: string;
}

export interface ShippingZone {
  id: string;
  name: string;
  comuna: string;
  cost: number;
  estimatedHours: string;
  freeShippingThreshold: number;
}

export interface FactoDteSummary {
  documentId: number;
  folio: number;
  documentTypeId: number;
  documentTypeName: string;
  siiCode: string;
  statusLabel: string;
  isSandbox: boolean;
  pdfUrl?: string;
  xmlUrl?: string;
}

export interface OrderSummary {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  customer: {
    nombre: string;
    email: string;
    telefono: string;
  };
  dte: DteInvoiceData;
  factoDte?: FactoDteSummary;
  subtotal: number;
  descuento: number;
  iva: number;
  costoEnvio: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  shippingZone: string;
  shippingAddress: string;
  items: {
    id: string;
    name: string;
    format: string;
    quantity: number;
    price: number;
    subtotal: number;
  }[];
}
