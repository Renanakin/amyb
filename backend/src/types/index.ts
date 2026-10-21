export type ProductCategory = 'sushi' | 'lacteos' | 'abarrotes' | 'congelados' | 'envases' | 'todos';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  categoryName: string;
  format: string; // e.g. "1.36 Kg", "Caja 500u", "Bidón 5L"
  description: string;
  price: number; // CLP
  originalPrice?: number;
  discountPercent?: number;
  isOffer?: boolean;
  stock: number;
  minWholesaleQty: number; // Unidades mínimas para precio escala
  image: string;
  badge?: string;
  brand: string;
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
  comuna: 'Temuco' | 'Padre Las Casas' | 'Vilcún';
  cost: number;
  estimatedHours: string;
  freeShippingThreshold: number;
}

export interface OrderItemPayload {
  productId: string;
  quantity: number;
}

export interface CreateOrderPayload {
  customer: {
    nombre: string;
    email: string;
    telefono: string;
  };
  dte: DteInvoiceData;
  shipping: {
    zoneId: string;
    direccionEntrega: string;
    departamento?: string;
    comuna?: string;
    instrucciones?: string;
    observaciones?: string;
  };
  paymentMethod: 'webpay' | 'transferencia' | 'contra_entrega';
  items: OrderItemPayload[];
  couponCode?: string;
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
  iva: number; // 19%
  costoEnvio: number;
  total: number;
  paymentMethod: string;
  paymentStatus: 'pendiente' | 'confirmado' | 'procesando';
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

