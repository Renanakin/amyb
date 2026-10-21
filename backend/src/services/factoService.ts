import { FactoAuthService } from '../facto/factoAuth.js';
import { FactoDocumentBuilder, FactoDtePayload } from '../facto/factoDocuments.js';
import { FACTO_CHILE } from '../facto/factoCodes.js';

export interface FactoDteResult {
  success: boolean;
  documentId: number;
  folio: number;
  documentTypeId: number;
  documentTypeName: string;
  siiCode: string;
  documentStatus: number;
  taxbureauSendStatus: number;
  taxbureauValidationStatus: number;
  statusLabel: string;
  isSandbox: boolean;
  pdfUrl?: string;
  xmlUrl?: string;
  rawResponse?: any;
  error?: string;
}

export class FactoService {
  private static baseUrl = process.env.FACTO_BASE_URL || 'https://apifacto.com/v1';

  /**
   * Un folio inventado es una factura que el SII nunca autorizo. En
   * produccion eso es un documento tributario falso emitido al cliente,
   * guardado en la base y con PDF descargable: un problema contable y
   * legal, no un detalle de software.
   *
   * Por eso los DTE simulados solo existen FUERA de produccion. Dentro,
   * si no hay credenciales o la API falla, el error sube y el pedido
   * queda marcado como "pendiente de emision" para reintentar.
   */
  private static isProduccion(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Emite el DTE tributario (Factura o Boleta) en FACTO Chile
   */
  public static async emitDte(params: {
    orderId: string;
    documentType: 'factura' | 'boleta';
    customer: {
      nombre: string;
      email: string;
      telefono?: string;
      rutEmpresa?: string;
      razonSocial?: string;
      giroComercial?: string;
      direccionTributaria?: string;
      comunaTributaria?: string;
    };
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      format?: string;
    }>;
    subtotal: number;
    iva: number;
    total: number;
  }): Promise<FactoDteResult> {
    const isFactura = params.documentType === 'factura';
    const docMeta = isFactura ? FACTO_CHILE.documentTypes.invoice : FACTO_CHILE.documentTypes.receipt;

    // 1. Construir el payload estándar chileno
    const payload = FactoDocumentBuilder.buildPayload(params);

    const hasCredentials = Boolean(
      process.env.FACTO_CLIENT_ID &&
      process.env.FACTO_CLIENT_SECRET &&
      process.env.FACTO_USERNAME &&
      process.env.FACTO_PASSWORD
    );

    // 2. Si no hay credenciales configuradas se puede emitir un DTE
    // SIMULADO, util para trabajar sin conexion. En produccion esto esta
    // prohibido: se sube el error para que el pedido quede pendiente de
    // emision real en vez de guardar un folio que el SII no conoce.
    if (!hasCredentials) {
      if (this.isProduccion()) {
        throw new Error(
          'FACTO_CHILE_SIN_CREDENCIALES: no hay credenciales de FACTO configuradas ' +
            'y NODE_ENV=production. No se emite ningun documento simulado en ' +
            'produccion. Revisar FACTO_CLIENT_ID, FACTO_CLIENT_SECRET, ' +
            'FACTO_USERNAME y FACTO_PASSWORD en el .env del servidor.'
        );
      }

      console.log(`[FACTO-SANDBOX-MOCK] Generando ${docMeta.name} (SII ${docMeta.siiCode}) en ambiente Sandbox simulado`);
      
      const mockDocId = Math.floor(88000 + Math.random() * 10000);
      const mockFolio = Math.floor(4500 + Math.random() * 1000);

      return {
        success: true,
        documentId: mockDocId,
        folio: mockFolio,
        documentTypeId: docMeta.id,
        documentTypeName: docMeta.name,
        siiCode: docMeta.siiCode,
        documentStatus: 1, // Emitido
        taxbureauSendStatus: 1, // Enviado exitosamente al SII
        taxbureauValidationStatus: 3, // Aprobado por el SII
        statusLabel:
          'DTE SIMULADO (FACTO sin credenciales) - NO es valido ante el SII',
        isSandbox: true,
        pdfUrl: `https://sandbox.apifacto.com/v1/documents/${mockDocId}/pdf?view=sample`,
        xmlUrl: `https://sandbox.apifacto.com/v1/documents/${mockDocId}/xml`,
        rawResponse: {
          code: 200,
          status: 'ok',
          message: 'Documento emitido exitosamente en Sandbox FACTO Chile',
          data: {
            document_id: mockDocId,
            folio: mockFolio,
            account_id: payload.account_id,
            totals: payload.totals
          }
        }
      };
    }

    // 3. Ejecución real contra API FACTO (Sandbox oficial o Producción)
    try {
      const token = await FactoAuthService.getValidToken();
      
      const response = await fetch(`${this.baseUrl}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const resData = (await response.json()) as any;

      if (!response.ok) {
        console.error('[FACTO-API-ERROR] Respuesta no satisfactoria:', resData);
        throw new Error(resData.message || `Error HTTP ${response.status} en FACTO API`);
      }

      const doc = resData.data || resData;
      const documentId = doc.document_id || doc.id;
      const folio = doc.folio ?? doc.header?.folio;

      // La API respondio 200 pero sin folio. Un DTE sin folio real no es
      // un documento valido, asi que se sube el error en vez de inventar
      // un numero: inventarlo produciria una factura falsa.
      if (folio === undefined || folio === null) {
        throw new Error(
          'FACTO_CHILE_RESPUESTA_SIN_FOLIO: la API respondio exitosamente pero ' +
            'sin folio en la respuesta. No se genera un folio ficticio.'
        );
      }

      return {
        success: true,
        documentId,
        folio,
        documentTypeId: docMeta.id,
        documentTypeName: docMeta.name,
        siiCode: docMeta.siiCode,
        documentStatus: doc.header?.document_status || 1,
        taxbureauSendStatus: doc.header?.taxbureau_send_status || 1,
        taxbureauValidationStatus: doc.header?.taxbureau_validation_status || 3,
        statusLabel: 'DTE Procesado en FACTO API',
        isSandbox: process.env.FACTO_SANDBOX === 'true',
        pdfUrl: `${this.baseUrl}/documents/${documentId}/pdf`,
        xmlUrl: `${this.baseUrl}/documents/${documentId}/xml`,
        rawResponse: resData
      };
    } catch (error: any) {
      // Los errores de integridad (sin credenciales en produccion, respuesta
      // sin folio) siempre suben: son condiciones que no se pueden simular
      // sin mentirle al cliente. En produccion tampoco se simula nada.
      if (String(error?.message ?? '').startsWith('FACTO_CHILE_') || this.isProduccion()) {
        throw error;
      }

      console.warn('[FACTO-FALLBACK] Error comunicando con FACTO API. Activando contingencia Sandbox:', error.message);
      
      // Fallback de contingencia SOLO en desarrollo: no se pierde la compra
      // mientras se arregla la conexion, y queda marcado como simulado.
      const fallbackDocId = Math.floor(77000 + Math.random() * 10000);
      const fallbackFolio = Math.floor(3000 + Math.random() * 1000);

      return {
        success: true,
        documentId: fallbackDocId,
        folio: fallbackFolio,
        documentTypeId: docMeta.id,
        documentTypeName: docMeta.name,
        siiCode: docMeta.siiCode,
        documentStatus: 0, // Borrador / Contingencia
        taxbureauSendStatus: 101, // Pendiente de reintento
        taxbureauValidationStatus: 0,
        statusLabel:
          'DTE SIMULADO por contingencia (FACTO no responde) - NO es valido ante el SII',
        isSandbox: true,
        error: error.message
      };
    }
  }

  /**
   * Consulta el estado asíncrono del documento en el SII
   */
  public static async getDocumentStatus(documentId: number): Promise<any> {
    const hasCredentials = Boolean(process.env.FACTO_CLIENT_ID);
    if (!hasCredentials) {
      // En produccion no se responde "Aprobado por el SII" sin credenciales:
      // seria una afirmacion falsa sobre el estado tributario de la empresa.
      if (this.isProduccion()) {
        return {
          documentId,
          isSandbox: true,
          taxbureauSendStatus: 0,
          taxbureauValidationStatus: 0,
          statusDescription:
            'FACTO Chile sin credenciales en produccion: estado desconocido',
          lastUpdated: new Date().toISOString()
        };
      }

      return {
        documentId,
        isSandbox: true,
        taxbureauSendStatus: 1,
        taxbureauValidationStatus: 3,
        statusDescription: 'Contenido Aprobado por el SII (Simulación Sandbox)',
        lastUpdated: new Date().toISOString()
      };
    }

    try {
      const token = await FactoAuthService.getValidToken();
      const response = await fetch(`${this.baseUrl}/documents/${documentId}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      return await response.json();
    } catch (err: any) {
      return {
        error: err.message,
        documentId,
        statusDescription: 'Error al consultar estado en FACTO'
      };
    }
  }
}
