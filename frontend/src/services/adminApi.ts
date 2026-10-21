/**
 * Cliente de API del panel de administracion.
 *
 * Todas las peticiones usan credentials: 'include' para que viaje la
 * cookie de sesion. El backend valida el rol admin en cada ruta, asi
 * que aunque alguien falsee la interfaz, no puede saltarse nada.
 */

const API_BASE = '/api/admin';

export interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  format: string;
  description: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  isOffer: boolean;
  stock: number;
  minWholesaleQty: number;
  image: string | null;
  badge: string | null;
  brand: string;
  isActive: boolean;
  priceTiers: { minQty: number; unitPrice: number }[];
}

export interface AdminOrder {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  cliente: string;
  email: string;
  telefono: string;
  total: number;
  subtotal: number;
  iva: number;
  costoEnvio: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  zona: string;
  direccion: string;
  dteFolio: string | null;
  dtePdfUrl: string | null;
  dteStatusLabel: string | null;
  /** Estado real en el SII, ya interpretado: aprobado | observado | rechazado | procesando | reintentando | error_permanente | desconocido */
  dteEstadoSii: string | null;
  items: { nombre: string; cantidad: number; precio: number; subtotal: number }[];
  ultimaTransaccion: {
    status: string;
    cardNumber: string | null;
    authorizationCode: string | null;
  } | null;
}

export interface AdminDashboard {
  ventas: { hoy: number; mes: number };
  pedidos: { hoy: number; mes: number; porPagar: number; cancelados: number };
  catalogo: { productosActivos: number; stockBajo: number };
  clientes: number;
  ultimosPedidos: {
    orderId: string;
    orderNumber: string;
    createdAt: string;
    total: number;
    paymentStatus: string;
    orderStatus: string;
    cliente: string;
    email: string;
    items: number;
  }[];
  topProductos: { productId: string; nombre: string; unidades: number }[];
}

export interface AdminClient {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rutEmpresa: string | null;
  razonSocial: string | null;
  isActive: boolean;
  createdAt: string;
  totalComprado: number;
  _count: { orders: number };
  // Nivel de precio asignado, si tiene
  priceTier?: { id: string; nombre: string; descuentoPercent: number } | null;
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });

  const data = await res.json().catch(() => ({}));

  // 403 significa que la cuenta no es admin. Se propaga para que la
  // interfaz muestre la pantalla de acceso restringido.
  if (res.status === 403) {
    throw new Error('FORBIDDEN');
  }

  return { status: res.status, data };
}

export const adminApi = {
  async getDashboard() {
    const { data } = await request('/dashboard');
    return data.data as AdminDashboard;
  },

  async getProducts(params: { search?: string; category?: string; estado?: string; stockBajo?: string } = {}) {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.category) q.set('category', params.category);
    if (params.estado) q.set('estado', params.estado);
    if (params.stockBajo) q.set('stockBajo', params.stockBajo);

    const { data } = await request(`/products?${q.toString()}`);
    return data.data as AdminProduct[];
  },

  async createProduct(payload: Partial<AdminProduct>) {
    return request('/products', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateProduct(id: string, payload: Partial<AdminProduct>) {
    return request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  async updateStock(id: string, stock: number, motivo?: string) {
    return request(`/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ stock, motivo })
    });
  },

  async deactivateProduct(id: string) {
    return request(`/products/${id}`, { method: 'DELETE' });
  },

  async reactivateProduct(id: string) {
    return request(`/products/${id}/reactivate`, { method: 'POST' });
  },

  async getOrders(params: { paymentStatus?: string; orderStatus?: string; search?: string } = {}) {
    const q = new URLSearchParams();
    if (params.paymentStatus) q.set('paymentStatus', params.paymentStatus);
    if (params.orderStatus) q.set('orderStatus', params.orderStatus);
    if (params.search) q.set('search', params.search);

    const { status, data } = await request(`/orders?${q.toString()}`);

    // Sin este chequeo, una respuesta de error (401, 500) llegaba aqui
    // como data.data === undefined. El cast "as AdminOrder[]" hacia que
    // TypeScript lo aceptara en silencio, y el panel reventaba al leer
    // pedidos.length. Un error de red no puede ser una lista vacia:
    // tiene que propagarse para que la vista lo muestre.
    if (status !== 200) {
      throw new Error(data?.message || 'No se pudieron cargar los pedidos.');
    }

    return {
      orders: Array.isArray(data.data) ? (data.data as AdminOrder[]) : [],
      total: typeof data.total === 'number' ? data.total : 0
    };
  },

  async updateOrderStatus(id: string, orderStatus: string) {
    return request(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ orderStatus })
    });
  },

  /** Reenvia un correo del pedido (factura, despacho o entrega). */
  async resendOrderEmail(id: string, tipo: 'factura' | 'despacho' | 'entrega') {
    return request(`/orders/${id}/reenviar-email`, {
      method: 'POST',
      body: JSON.stringify({ tipo })
    });
  },

  async getClients() {
    const { data } = await request('/clients');
    return data.data as AdminClient[];
  },

  // ---- Inventario multi-bodega ----

  async getBodegas() {
    return request('/bodegas');
  },

  async getStockBodega(id: string, search?: string) {
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    return request(`/bodegas/${id}/stock?${q.toString()}`);
  },

  async getKardex(tipo?: string) {
    const q = new URLSearchParams();
    if (tipo) q.set('type', tipo);
    return request(`/kardex?${q.toString()}`);
  },

  // ---- Niveles de precio de cliente ----

  async getPriceTiers() {
    const { data } = await request('/price-tiers');
    return data.data as any[];
  },

  async createPriceTier(payload: {
    nombre: string;
    descripcion?: string;
    descuentoPercent: number;
    aplicaSobreEscalon?: boolean;
    color?: string;
  }) {
    return request('/price-tiers', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updatePriceTier(id: string, payload: any) {
    return request(`/price-tiers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  /** Asigna (o quita con null) el nivel de precio de un cliente. */
  async assignPriceTier(clientId: string, priceTierId: string | null) {
    return request(`/clients/${clientId}/price-tier`, {
      method: 'POST',
      body: JSON.stringify({ priceTierId })
    });
  },

  // ---- Configuracion de despacho ----

  async getDeliveryConfig() {
    const { data } = await request('/delivery-config');
    return data.data as any;
  },

  async updateDeliveryConfig(payload: any) {
    return request('/delivery-config', { method: 'PUT', body: JSON.stringify(payload) });
  },

  async testAddress(direccion: string, subtotal = 0) {
    return request('/delivery-config/test', {
      method: 'POST',
      body: JSON.stringify({ direccion, subtotal })
    });
  }
};
