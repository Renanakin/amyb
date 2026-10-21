import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { datoObligatorio, datoOpcional } from '../config.js';
import { FACTO_CHILE } from '../facto/factoCodes.js';

const router = Router();

export interface DteLedgerItem {
  id: string;
  orderId: string;
  orderNumber: string;
  documentId: number;
  folio: number;
  documentTypeId: number;
  documentTypeName: string;
  siiCode: string;
  fechaEmision: string;
  receptor: {
    rut?: string;
    razonSocial: string;
    giro?: string;
    direccion?: string;
    email?: string;
  };
  neto: number;
  iva: number;
  total: number;
  statusLabel: string;
  taxbureauSendStatus: number;
  taxbureauValidationStatus: number;
  isSandbox: boolean;
  pdfUrl?: string;
  xmlUrl?: string;
  /**
   * Lineas de detalle del comprobante.
   *
   * Una factura electronica sin detalle no sirve: el SII exige
   *_itemizar_ cada operacion con codigo, descripcion, cantidad y
   * precio unitario. Este comprobante es una emulacion visual, asi
   * que los datos son los del pedido real, pero el documento no
   * tiene validez tributaria.
   */
  items: DteLineItem[];
}

/** Una linea del comprobante, con la forma que exige el DTE chileno. */
export interface DteLineItem {
  /** Codigo interno del producto. En el DTE real es el exento o NIT. */
  codigo: string;
  descripcion: string;
  /** Formato comercial, ej. "Barra 1.36 Kg". */
  formato: string;
  cantidad: number;
  /** Precio unitario neto, sin IVA. */
  precioUnitario: number;
  /** Subtotal de la linea: cantidad x precioUnitario. */
  subtotal: number;
}

// Semilla de documentos de prueba en Sandbox Temuco para inicializar el libro tributario
const SEED_DTE_DOCUMENTS: DteLedgerItem[] = [
  {
    id: 'dte-seed-001',
    orderId: 'AMYB-2026-1042',
    orderNumber: '#1042',
    documentId: 93380,
    folio: 4514,
    documentTypeId: 2,
    documentTypeName: 'Factura Electrónica',
    siiCode: '33',
    fechaEmision: new Date(Date.now() - 86400000 * 2).toISOString(),
    receptor: {
      rut: '78.901.234-5',
      razonSocial: 'Pizzería & Ristorante La Frontera SpA',
      giro: 'Restaurante y Elaboración de Pizzas',
      direccion: 'Av. Alemania 0450, Temuco',
      email: 'facturas@lafronterapizza.cl'
    },
    neto: 74370,
    iva: 14130,
    total: 88500,
    statusLabel: 'DTE Autorizado por SII (Sandbox FACTO)',
    taxbureauSendStatus: 1,
    taxbureauValidationStatus: 3,
    isSandbox: true,
    pdfUrl: 'https://sandbox.apifacto.com/v1/documents/93380/pdf?view=sample',
    xmlUrl: 'https://sandbox.apifacto.com/v1/documents/93380/xml',
    // 20 x 3.000 + 5 x 2.874 = 74.370 neto
    items: [
      {
        codigo: 'LAC-GB-1360',
        descripcion: 'Queso Crema Green Bay',
        formato: 'Barra 1.36 Kg',
        cantidad: 20,
        precioUnitario: 3000,
        subtotal: 60000
      },
      {
        codigo: 'MAR-NOR-100',
        descripcion: 'Alga Nori Gold Superior',
        formato: 'Caja 100 hojas',
        cantidad: 5,
        precioUnitario: 2874,
        subtotal: 14370
      }
    ]
  },
  {
    id: 'dte-seed-002',
    orderId: 'AMYB-2026-1048',
    orderNumber: '#1048',
    documentId: 93381,
    folio: 4515,
    documentTypeId: 2,
    documentTypeName: 'Factura Electrónica',
    siiCode: '33',
    fechaEmision: new Date(Date.now() - 86400000).toISOString(),
    receptor: {
      rut: '76.543.210-K',
      razonSocial: 'Inversiones Sushi Temuco SpA',
      giro: 'Restaurante de Comida Japonesa & Delivery',
      direccion: 'Av. San Martín 0890, Temuco',
      email: 'contabilidad@sushitemuco.cl'
    },
    neto: 122605,
    iva: 23295,
    total: 145900,
    statusLabel: 'DTE Autorizado por SII (Sandbox FACTO)',
    taxbureauSendStatus: 1,
    taxbureauValidationStatus: 3,
    isSandbox: true,
    pdfUrl: 'https://sandbox.apifacto.com/v1/documents/93381/pdf?view=sample',
    xmlUrl: 'https://sandbox.apifacto.com/v1/documents/93381/xml',
    // 10 x 4.990 + 40 x 1.200 + 5 x 4.941 = 122.605 neto
    items: [
      {
        codigo: 'ACE-CHF-5L',
        descripcion: 'Aceite 100% Maravilla Chef Bidon 5L',
        formato: 'Bidon 5 Litros',
        cantidad: 10,
        precioUnitario: 4990,
        subtotal: 49900
      },
      {
        codigo: 'ABR-CAR-SCH',
        descripcion: 'Mayonesa Casera Carozzi Sachet',
        formato: 'Sachet 500 cc',
        cantidad: 40,
        precioUnitario: 1200,
        subtotal: 48000
      },
      {
        codigo: 'CON-IQF-SUR',
        descripcion: 'Surtido de Mariscos IQF',
        formato: 'Caja 2 Kg',
        cantidad: 5,
        precioUnitario: 4941,
        subtotal: 24705
      }
    ]
  },
  {
    id: 'dte-seed-003',
    orderId: 'AMYB-2026-1052',
    orderNumber: '#1052',
    documentId: 90035,
    folio: 5070,
    documentTypeId: 37,
    documentTypeName: 'Boleta Electrónica',
    siiCode: '39',
    fechaEmision: new Date(Date.now() - 43200000).toISOString(),
    receptor: {
      razonSocial: 'Sebastián Lagos',
      email: 'sebastian.lagos@gmail.com'
    },
    neto: 24790,
    iva: 4710,
    total: 29500,
    statusLabel: 'DTE Autorizado por SII (Sandbox FACTO)',
    taxbureauSendStatus: 1,
    taxbureauValidationStatus: 3,
    isSandbox: true,
    pdfUrl: 'https://sandbox.apifacto.com/v1/documents/90035/pdf?view=sample',
    xmlUrl: 'https://sandbox.apifacto.com/v1/documents/90035/xml',
    // 2 x 8.990 + 2 x 3.405 = 24.790 neto
    items: [
      {
        codigo: 'LAC-GB-1360',
        descripcion: 'Queso Crema Green Bay',
        formato: 'Barra 1.36 Kg',
        cantidad: 2,
        precioUnitario: 8990,
        subtotal: 17980
      },
      {
        codigo: 'ABR-ARR-GCO',
        descripcion: 'Arroz Grano Corto y Panko Japonés',
        formato: 'Caja 10 Kg',
        cantidad: 2,
        precioUnitario: 3405,
        subtotal: 6810
      }
    ]
  }
];

// GET /api/facto/ledger (Libro de Ventas y Facturas/Boletas Emitidas)
router.get('/', async (_req: Request, res: Response) => {
  // Documentos realmente emitidos: se leen de PostgreSQL, no de memoria.
  // Antes cada reinicio del servidor vaciaba el libro tributario.
  const orders = await prisma.order.findMany({
    where: { dteDocumentId: { not: null } },
    include: { items: { include: { product: { select: { sku: true } } } } },
    orderBy: { createdAt: 'desc' }
  });

  const liveDtes: DteLedgerItem[] = orders.map((order) => ({
    id: `dte-live-${order.dteDocumentId}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    documentId: order.dteDocumentId as number,
    // El folio se guarda como texto en la base; el libro lo compara
    // numericamente, asi que se normaliza a numero.
    folio: Number(order.dteFolio) || 0,
    documentTypeId: order.dteTipoDocumento === 'factura' ? 2 : 37,
    documentTypeName: order.dteTipoDocumento === 'factura' ? 'Factura Electrónica' : 'Boleta Electrónica',
    siiCode: order.dteTipoDocumento === 'factura' ? '33' : '39',
    fechaEmision: order.createdAt.toISOString(),
    receptor: {
      rut: order.dteRutEmpresa ?? undefined,
      razonSocial: order.dteRazonSocial || order.customerNombre,
      giro: order.dteGiroComercial ?? undefined,
      direccion: order.dteDireccion ?? undefined,
      email: order.customerEmail
    },
    neto: order.neto,
    iva: order.iva,
    total: order.total,
    statusLabel: order.dteStatusLabel ?? 'Emitido',
    taxbureauSendStatus: 1,
    taxbureauValidationStatus: 3,
    isSandbox: process.env.FACTO_SANDBOX === 'true',
    pdfUrl: order.dtePdfUrl ?? undefined,
    xmlUrl: order.dteXmlUrl ?? undefined,
    items: order.items.map((i) => ({
      // El SKU real, no el id interno: asi el comprobante se ve
      // igual que el que emitira FACTO cuando haya credenciales.
      codigo: i.product.sku,
      descripcion: i.productName,
      formato: i.productFormat,
      cantidad: i.quantity,
      precioUnitario: i.unitPrice,
      subtotal: i.subtotal
    }))
  }));

  // Combinar documentos reales + semilla histórica de Sandbox
  const allDocuments = [...liveDtes, ...SEED_DTE_DOCUMENTS];

  // Ordenar descendente por folio
  allDocuments.sort((a, b) => b.folio - a.folio);

  // Calcular métricas del libro tributario
  const totalFacturado = allDocuments.reduce((sum, d) => sum + d.total, 0);
  const totalNeto = allDocuments.reduce((sum, d) => sum + d.neto, 0);
  const totalIvaDebito = allDocuments.reduce((sum, d) => sum + d.iva, 0);
  const totalFacturas = allDocuments.filter(d => d.documentTypeId === 2).length;
  const totalBoletas = allDocuments.filter(d => d.documentTypeId === 37).length;

  res.json({
    success: true,
    summary: {
      totalDocumentos: allDocuments.length,
      totalFacturas,
      totalBoletas,
      totalFacturado,
      totalNeto,
      totalIvaDebito,
      ambiente: process.env.FACTO_SANDBOX === 'true' || !process.env.FACTO_CLIENT_ID
        ? 'FACTO Chile Sandbox (Ambiente de Pruebas - Cuenta #423)'
        : 'FACTO Chile Producción SII',
      // La identidad del emisor NO se inventa: sale del .env del servidor.
// Mostrar un RUT de ejemplo como si fuera el real hace que el operador
// tome decisiones tributarias sobre datos falsos.
emisorDefault: {
        rut: datoObligatorio(
          'FACTO_EMISOR_RUT',
          '77.987.654-3',
          'el emisor que se muestra en el libro tributario'
        ),
        razonSocial: datoObligatorio(
          'FACTO_EMISOR_RAZON_SOCIAL',
          'Amyb Distribuidora Gastronomica SpA',
          'el emisor que se muestra en el libro tributario'
        ),
        giro: datoOpcional('FACTO_EMISOR_GIRO'),
        comuna: datoOpcional('FACTO_COMUNA') ?? 'Temuco'
      }
    },
    count: allDocuments.length,
    data: allDocuments
  });
});

export default router;
