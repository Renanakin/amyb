import { Product, ShippingZone, OrderSummary, DteInvoiceData } from '../types';

const API_BASE = '/api';

/**
 * Catalogo de respaldo — OBSOLETO, NO SE USA.
 *
 * Se conserva solo como referencia historica del catalogo original.
 * Antes se mostraba cuando el backend no respondia, y eso era
 * peligroso: el cliente veia precios que ya no eran los reales,
 * agregaba al carrito y la venta se caia al confirmar.
 *
 * El catalogo SIEMPRE viene de la base de datos. Si el servidor no
 * responde, la interfaz informa el error en vez de inventar datos.
 */
const FALLBACK_PRODUCTS_LEGACY: Product[] = [
  {
    id: 'prod-001',
    sku: 'LAC-GB-1360',
    name: 'Queso Crema Green Bay',
    category: 'sushi',
    categoryName: 'Especial Sushi & Lácteos',
    format: 'Barra 1.36 Kg',
    description: 'Queso crema de alta consistencia térmica ideal para rollos calientes (tempura/panko) y piezas frías. Textura untuosa sin desuerar.',
    price: 9490,
    originalPrice: 11000,
    discountPercent: 14,
    isOffer: true,
    stock: 45,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&w=600&q=80&fit=crop',
    badge: 'Oferta Semanal',
    brand: 'Green Bay'
  },
  {
    id: 'prod-002',
    sku: 'SAL-CZ-500U',
    name: 'Mayonesa Casera Carozzi Sachet',
    category: 'abarrotes',
    categoryName: 'Salsas & Fast Food',
    format: 'Caja Dispensadora 500u',
    description: 'Sachets individuales de 8g con formulación cremosa tradicional. Higiene y dosificación exacta para delivery de pizzerías y hamburgueserías.',
    price: 15990,
    originalPrice: 19990,
    discountPercent: 20,
    isOffer: true,
    stock: 28,
    minWholesaleQty: 3,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&w=600&q=80&fit=crop',
    badge: 'Caja Cerrada',
    brand: 'Carozzi'
  },
  {
    id: 'prod-003',
    sku: 'CON-MAR-1000',
    name: 'Surtido de Mariscos IQF',
    category: 'congelados',
    categoryName: 'Congelados del Mar',
    format: 'Bolsa 1 Kg',
    description: 'Mix congelado individualmente (IQF): choritos, machas, camarón y calamar. Listo para pailas marinas, empanadas y pastas.',
    price: 4900,
    originalPrice: 6500,
    discountPercent: 25,
    isOffer: true,
    stock: 60,
    minWholesaleQty: 10,
    image: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&w=600&q=80&fit=crop',
    badge: 'Congelado IQF',
    brand: 'Mar de Chile'
  },
  {
    id: 'prod-004',
    sku: 'LAC-PF-1360',
    name: 'Queso Crema Prairie Farms',
    category: 'sushi',
    categoryName: 'Especial Sushi',
    format: 'Barra 1.36 Kg',
    description: 'Queso crema de origen estadounidense preferido por sushi chefs por su suavidad y corte firme. Grado culinario superior.',
    price: 9990,
    originalPrice: 11490,
    discountPercent: 13,
    isOffer: false,
    stock: 35,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&w=600&q=80&fit=crop',
    badge: 'Favorito Chefs',
    brand: 'Prairie Farms'
  },
  {
    id: 'prod-005',
    sku: 'LAC-COL-2500',
    name: 'Queso Mozzarella Barra Colun',
    category: 'lacteos',
    categoryName: 'Pizzerías & Quesos',
    format: 'Barra 2.5 Kg',
    description: 'Queso mozzarella chileno elaborado en el sur del país. Óptimo punto de fundido, gratinado dorado y hebra elástica para pizzas gourmet.',
    price: 18990,
    originalPrice: 21500,
    discountPercent: 12,
    isOffer: false,
    stock: 22,
    minWholesaleQty: 4,
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&w=600&q=80&fit=crop',
    badge: 'Hecho en el Sur',
    brand: 'Colun'
  },
  {
    id: 'prod-006',
    sku: 'ABA-ACE-5000',
    name: 'Aceite 100% Maravilla Chef Bidón 5L',
    category: 'abarrotes',
    categoryName: 'Despensa & Aceites',
    format: 'Bidón 5 Litros',
    description: 'Aceite refinado de alto rendimiento y resistencia térmica para freidoras continuas. Sin sabor residual, ideal para fritura crocante.',
    price: 12490,
    originalPrice: 13990,
    discountPercent: 11,
    isOffer: false,
    stock: 50,
    minWholesaleQty: 4,
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&w=600&q=80&fit=crop',
    badge: 'Alto Rendimiento',
    brand: 'Chef'
  },
  {
    id: 'prod-007',
    sku: 'SUSH-NOR-100',
    name: 'Alga Nori Gold Superior (100 Hojas)',
    category: 'sushi',
    categoryName: 'Especial Sushi',
    format: 'Paquete 100 Hojas',
    description: 'Alga tostada de calidad Gold con grosor uniforme, textura crujiente y aroma fresco. No se quiebra al enrollar sushi maki ni uramaki.',
    price: 13990,
    originalPrice: 15990,
    discountPercent: 12,
    isOffer: false,
    stock: 40,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?auto=format&w=600&q=80&fit=crop',
    badge: 'Calidad Gold',
    brand: 'Takaokaya'
  },
  {
    id: 'prod-008',
    sku: 'SUSH-ARZ-5000',
    name: 'Arroz Grano Corto Koshihikari 5 Kg',
    category: 'sushi',
    categoryName: 'Especial Sushi',
    format: 'Saco 5 Kg',
    description: 'Arroz pulido especial para sushi. Excelente absorción de vinagre sazonador y adherencia perfecta para shari.',
    price: 10890,
    originalPrice: 12500,
    discountPercent: 13,
    isOffer: false,
    stock: 30,
    minWholesaleQty: 4,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&w=600&q=80&fit=crop',
    badge: 'Grano Japonés',
    brand: 'Koshi'
  },
  {
    id: 'prod-009',
    sku: 'CON-SAL-1000',
    name: 'Filete de Salmón Premium IQF',
    category: 'congelados',
    categoryName: 'Carnes & Mariscos',
    format: 'Filete 1 Kg (Al Vacío)',
    description: 'Salmón del sur de Chile, sin piel ni espinas, ultracongelado en origen. Grado sushi con carne firme y veteado uniforme.',
    price: 14500,
    originalPrice: 16990,
    discountPercent: 15,
    isOffer: true,
    stock: 18,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&w=600&q=80&fit=crop',
    badge: 'Grado Sushi',
    brand: 'Australis'
  },
  {
    id: 'prod-010',
    sku: 'CON-PUL-1000',
    name: 'Pulpa de Frutilla 100% Natural 1 Kg',
    category: 'congelados',
    categoryName: 'Congelados & Pulpas',
    format: 'Bolsa 1 Kg',
    description: 'Pulpa pura pasteurizada y congelada sin azúcar añadida. Para coctelería HORECA, jugos naturales y repostería.',
    price: 3690,
    originalPrice: 4200,
    discountPercent: 12,
    isOffer: false,
    stock: 45,
    minWholesaleQty: 10,
    image: 'https://images.unsplash.com/photo-1543528176-61b239494933?auto=format&w=600&q=80&fit=crop',
    badge: '100% Fruta',
    brand: 'SurAndino'
  },
  {
    id: 'prod-011',
    sku: 'ENV-CT3-100',
    name: 'Caja Térmica Hamburguesa CT3 (100u)',
    category: 'envases',
    categoryName: 'Envases Descartables',
    format: 'Manga 100 Unidades',
    description: 'Contenedor térmico con cierre hermético para hamburguesas y sandwiches calientes. Aislamiento térmico que preserva temperatura.',
    price: 6890,
    originalPrice: 7990,
    discountPercent: 14,
    isOffer: false,
    stock: 75,
    minWholesaleQty: 5,
    image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&w=600&q=80&fit=crop',
    badge: 'Apto Alimentos',
    brand: 'Darnel'
  },
  {
    id: 'prod-012',
    sku: 'ABA-SOY-1890',
    name: 'Salsa de Soya Tradicional Kikkoman 1.89L',
    category: 'sushi',
    categoryName: 'Especial Sushi',
    format: 'Botella 1.89 Litros',
    description: 'Salsa de soya naturalmente fermentada. Formato institucional para cocinas gastronómicas de alta rotación.',
    price: 11990,
    originalPrice: 13500,
    discountPercent: 11,
    isOffer: false,
    stock: 32,
    minWholesaleQty: 3,
    image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&w=600&q=80&fit=crop',
    badge: 'Fermentación Natural',
    brand: 'Kikkoman'
  }
];

export const FALLBACK_SHIPPING_ZONES: ShippingZone[] = [
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

export const api = {
  /**
   * Catalogo desde el servidor, siempre.
   *
   * Antes, si el backend no respondia, se devolvia un catalogo local
   * hardcodeado. Eso es peor que mostrar un error: el cliente veía
   * precios que ya no son los reales, agregaba al carrito believinglos
   * y la venta se caia al confirmar. Ahora se devuelve un arreglo
   * vacio y la interfaz muestra que no se pudo cargar.
   */
  async getProducts(category?: string, search?: string, brand?: string): Promise<Product[]> {
    try {
      const params = new URLSearchParams();
      if (category && category !== 'todos' && category !== 'all') params.append('category', category);
      if (search) params.append('search', search);
      if (brand && brand !== 'todas') params.append('brand', brand);

      const res = await fetch(`${API_BASE}/products?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.data;
    } catch (err) {
      console.error('[API] No se pudo cargar el catalogo:', err);
      return [];
    }
  },

  async getShippingZones(): Promise<ShippingZone[]> {
    try {
      const res = await fetch(`${API_BASE}/shipping/zones`);
      if (!res.ok) throw new Error('Error fetching shipping zones');
      const data = await res.json();
      return data.data;
    } catch {
      return FALLBACK_SHIPPING_ZONES;
    }
  },

  async createOrder(payload: {
    customer: { nombre: string; email: string; telefono: string };
    dte: DteInvoiceData;
    shipping: { zoneId: string; direccionEntrega: string };
    paymentMethod: 'webpay' | 'transferencia' | 'contra_entrega';
    items: { productId: string; quantity: number }[];
    couponCode?: string;
  }): Promise<{ success: boolean; data: OrderSummary; message?: string; code?: string }> {
    // Sin red no se SIMULA un pedido.
    //
    // Antes, si el backend no respondia, esta funcion fabricaba un
    // pedido con numero y total inventados y devolvia success: true.
    // El cliente veia "pedido completado" y la tienda no tenia nada.
    // En una venta real eso es perder una venta sin saberlo, y en el
    // escritorio del admin aparece una venta fantasma.
    //
    // Si no hay servidor, se informa el error y no se cobra nada.
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    return data;
  },

  async getClientConfig(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/client-config`);
      if (!res.ok) throw new Error('Error fetching client config');
      return await res.json();
    } catch {
      return {
        success: true,
        device: { isMobile: window.innerWidth < 768, clientType: window.innerWidth < 768 ? 'mobile' : 'desktop' },
        config: {
          mobileFirst: { enabled: true, version: '2.0.0-mobilefirst', fallbackVersion: '1.0.0-web-responsive' }
        }
      };
    }
  },

  async reportFallback(reason: string, errorDetail?: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/client-config/fallback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          errorDetail,
          device: {
            userAgent: navigator.userAgent,
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            touchPoints: navigator.maxTouchPoints
          }
        })
      });
    } catch {
      // Non-blocking telemetry fallback
      console.warn('[FALLBACK TELEMETRY] No se pudo enviar reporte al backend (modo offline).');
    }
  },

  async getFactoLedger(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/facto/ledger`);
      if (!res.ok) throw new Error('Error al cargar libro DTE');
      return await res.json();
    } catch (err) {
      console.warn('[FACTO-LEDGER] Backend no disponible, cargando datos locales:', err);
      return {
        success: true,
        summary: {
          totalDocumentos: 3,
          totalFacturas: 2,
          totalBoletas: 1,
          totalFacturado: 263900,
          totalNeto: 221765,
          totalIvaDebito: 42135,
          ambiente: 'FACTO Chile Sandbox (Cuenta #423)',
          emisorDefault: {
            rut: '77.987.654-3',
            razonSocial: 'Amyb Distribuidora Gastronómica SpA',
            giro: 'Distribución Mayorista de Insumos Gastronómicos HORECA',
            comuna: 'Temuco'
          }
        },
        data: [
          {
            id: 'dte-seed-001',
            orderId: 'AMYB-2026-1048',
            folio: 4516,
            documentTypeId: 2,
            documentTypeName: 'Factura Electrónica',
            siiCode: '33',
            fechaEmision: new Date().toISOString(),
            receptor: {
              rut: '77.123.456-9',
              razonSocial: 'Gastronomía y Sabores SpA',
              giro: 'Restaurante y Comidas Preparadas',
              direccion: 'Av. Alemania 0890, Temuco'
            },
            neto: 18462,
            iva: 3508,
            total: 21970,
            statusLabel: 'DTE Autorizado por SII (Sandbox FACTO)',
            taxbureauSendStatus: 1,
            taxbureauValidationStatus: 3,
            isSandbox: true,
            pdfUrl: 'https://sandbox.apifacto.com/v1/documents/93383/pdf?view=sample',
            xmlUrl: 'https://sandbox.apifacto.com/v1/documents/93383/xml'
          },
          {
            id: 'dte-seed-002',
            orderId: 'AMYB-2026-1042',
            folio: 4515,
            documentTypeId: 2,
            documentTypeName: 'Factura Electrónica',
            siiCode: '33',
            fechaEmision: new Date(Date.now() - 86400000).toISOString(),
            receptor: {
              rut: '76.543.210-K',
              razonSocial: 'Inversiones Sushi Temuco SpA',
              giro: 'Restaurante Sushi & Delivery',
              direccion: 'Av. San Martín 0890, Temuco'
            },
            neto: 122605,
            iva: 23295,
            total: 145900,
            statusLabel: 'DTE Autorizado por SII (Sandbox FACTO)',
            taxbureauSendStatus: 1,
            taxbureauValidationStatus: 3,
            isSandbox: true,
            pdfUrl: 'https://sandbox.apifacto.com/v1/documents/93381/pdf?view=sample',
            xmlUrl: 'https://sandbox.apifacto.com/v1/documents/93381/xml'
          },
          {
            id: 'dte-seed-003',
            orderId: 'AMYB-2026-1035',
            folio: 5071,
            documentTypeId: 37,
            documentTypeName: 'Boleta Electrónica',
            siiCode: '39',
            fechaEmision: new Date(Date.now() - 172800000).toISOString(),
            receptor: {
              razonSocial: 'Camila Soto',
              email: 'camila@gmail.com'
            },
            neto: 24790,
            iva: 4710,
            total: 29500,
            statusLabel: 'DTE Autorizado por SII (Sandbox FACTO)',
            taxbureauSendStatus: 1,
            taxbureauValidationStatus: 3,
            isSandbox: true,
            pdfUrl: 'https://sandbox.apifacto.com/v1/documents/90038/pdf?view=sample',
            xmlUrl: 'https://sandbox.apifacto.com/v1/documents/90038/xml'
          }
        ]
      };
    }
  }
};
