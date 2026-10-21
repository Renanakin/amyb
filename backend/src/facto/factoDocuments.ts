import { FACTO_CHILE } from './factoCodes.js';
import { datoObligatorio } from '../config.js';

export interface FactoDtePayload {
  account_id: number;
  document_type_id: number;
  currency_id: number;
  header: {
    document_date: string;
    payment_type_id: number;
    term_days?: number;
  };
  issuer: {
    rut: string;
    legal_name: string;
    activity: string;
    address: string;
    state_id: number;
    city: string;
  };
  customer: {
    legal_name: string;
    activity?: string;
    address?: string;
    city?: string;
    email?: string;
    identification_type?: string;
    identification_number?: string;
  };
  detail: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    unit_code: string;
    tax_type_id: number;
    tax_percentage: number;
  }>;
  totals: {
    net_amount: number;
    tax_amount: number;
    total_amount: number;
  };
}

/**
 * Datos de emisor USADOS SOLO EN DESARROLLO.
 *
 * Aqui no viven por gusto: existen para que el sandbox de FACTO y las
 * pruebas puedan construir un payload sin pedir configuracion. En
 * produccion estos valores NO se usan: si falta la variable de entorno,
 * `datoObligatorio` lanza el error y el documento no se emite.
 *
 * QUE LOS GENERA: el .env del servidor, con los datos legales reales de
 * Amyb (FACTO_ACCOUNT_ID, FACTO_EMISOR_RUT, FACTO_EMISOR_RAZON_SOCIAL,
 * FACTO_EMISOR_GIRO, FACTO_EMISOR_DIRECCION). Son los que salen
 * impresos en cada factura.
 */
const DATOS_EMISOR_DESARROLLO = {
  accountId: '423', // account_id del sandbox documentado por FACTO
  rut: '77.987.654-3',
  razonSocial: 'Amyb Distribuidora Gastronomica SpA',
  giro: 'Distribucion Mayorista de Insumos Gastronomicos HORECA',
  direccion: 'Av. Alemania 0890, Temuco'
};

export class FactoDocumentBuilder {
  /**
   * Normaliza el RUT al formato estÃ¡ndar requerido por FACTO Chile (sin puntos, con guion: "77123456-8")
   */
  public static normalizeRut(rawRut: string): string {
    return rawRut.replace(/\./g, '').trim().toUpperCase();
  }

  /**
   * El RUT del receptor es obligatorio para emitir una Factura.
   *
   * No tiene valor de desarrollo: es informacion del cliente, no
   * configuracion. Si no viene, se falla en TODOS los ambientes, porque
   * emitir la factura igual produciria un documento inservible para el
   * comprador.
   */
  private static exigirRutReceptor(
    rut: string | undefined,
    nombreCliente: string
  ): string {
    const limpio = (rut ?? '').replace(/\./g, '').trim().toUpperCase();
    if (limpio) return limpio;

    throw new Error(
      `FACTO_CHILE_RUT_RECEPTOR_FALTANTE: "${nombreCliente}" solicito Factura ` +
        `pero no informo su RUT. Una factura sin RUT del receptor no puede ser ` +
        `usada por el comprador, asi que no se emite. Pedir el RUT al cliente y ` +
        `reintentar. (Las Boletas no necesitan RUT.)`
    );
  }

  /**
   * Construye el payload tributario chileno para Factura (Tipo 2) o Boleta (Tipo 37)
   */
  public static buildPayload(params: {
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
      price: number; // Precio con IVA incluido
      format?: string;
    }>;
    subtotal: number;
    iva: number;
    total: number;
  }): FactoDtePayload {
    const isFactura = params.documentType === 'factura';
    const document_type_id = isFactura
      ? FACTO_CHILE.documentTypes.invoice.id   // 2 (SII 33)
      : FACTO_CHILE.documentTypes.receipt.id;  // 37 (SII 39)

    const today = new Date().toISOString().split('T')[0];

    // account_id del emisor en FACTO. 423 es la cuenta de SANDBOX: en
    // produccion tiene que venir del .env, porque con credenciales reales
    // pero sin esta variable todos los documentos se irian a la cuenta
    // equivocada sin avisar.
    const accountId = Number(
      datoObligatorio(
        'FACTO_ACCOUNT_ID',
        DATOS_EMISOR_DESARROLLO.accountId,
        'el account_id emisor en FACTO'
      )
    );

    // Identidad del emisor. Son los datos legales de Amyb: NO se pueden
    // adivinar. En desarrollo se usan los valores de prueba declarados
    // abajo; en produccion faltan -> error, porque una factura emitida
    // con el RUT equivocado es un documento invalido ante el SII.
    const issuer = {
      rut: this.normalizeRut(
        datoObligatorio(
          'FACTO_EMISOR_RUT',
          DATOS_EMISOR_DESARROLLO.rut,
          'el RUT del emisor en cada factura'
        )
      ),
      legal_name: datoObligatorio(
        'FACTO_EMISOR_RAZON_SOCIAL',
        DATOS_EMISOR_DESARROLLO.razonSocial,
        'la razon social del emisor'
      ),
      activity: datoObligatorio(
        'FACTO_EMISOR_GIRO',
        DATOS_EMISOR_DESARROLLO.giro,
        'el giro del emisor'
      ),
      address: datoObligatorio(
        'FACTO_EMISOR_DIRECCION',
        DATOS_EMISOR_DESARROLLO.direccion,
        'la direccion del emisor'
      ),
      state_id: FACTO_CHILE.regions.Araucania,
      city: 'Temuco'
    };

    // Receptor (Empresa con RUT para Factura, o Consumidor para Boleta)
    // Receptor. En una Factura el RUT del cliente es OBLIGATORIO por
    // ley: sin el, el documento no sirve para que el comprador lo
    // descuente. Antes se completaba con un RUT inventado, lo que
    // producia facturas a nombre de un contribuyente que no existe.
    //
    // Ahora el dato se exige. Si falta, el pedido no se factura y el
    // error explica que hay que pedirle el RUT al cliente. Para los giro,
    // direccion y comuna no se inventan valores: se omiten los que el
    // cliente no informo.
    const customer = isFactura
      ? {
          legal_name: params.customer.razonSocial || params.customer.nombre,
          activity: params.customer.giroComercial || undefined,
          address: params.customer.direccionTributaria || undefined,
          city: params.customer.comunaTributaria || undefined,
          email: params.customer.email,
          identification_type: FACTO_CHILE.identificationTypes.RUT,
          identification_number: this.normalizeRut(
            this.exigirRutReceptor(params.customer.rutEmpresa, params.customer.nombre)
          )
        }
      : {
          legal_name: params.customer.nombre,
          email: params.customer.email,
          city: params.customer.comunaTributaria || undefined
        };

    // LÃ­neas de detalle con cÃ¡lculo neto y tasa de IVA 19% (tax_type: 387)
    const detail = params.items.map((item) => {
      // Precio unitario neto redondeado a entero CLP
      const unitPriceNet = Math.round(item.price / 1.19);
      let unitCode = FACTO_CHILE.units.UN;
      const lowerFormat = (item.format || '').toLowerCase();
      if (lowerFormat.includes('kg') || lowerFormat.includes('kilo')) unitCode = FACTO_CHILE.units.KG;
      else if (lowerFormat.includes('litro') || lowerFormat.includes('l')) unitCode = FACTO_CHILE.units.LT;
      else if (lowerFormat.includes('caja') || lowerFormat.includes('box')) unitCode = FACTO_CHILE.units.BOX;
      else if (lowerFormat.includes('pack') || lowerFormat.includes('manga')) unitCode = FACTO_CHILE.units.PACK;

      return {
        name: item.name,
        quantity: item.quantity,
        unit_price: unitPriceNet,
        unit_code: unitCode,
        tax_type_id: FACTO_CHILE.taxTypes.iva19.id,
        tax_percentage: FACTO_CHILE.taxTypes.iva19.value
      };
    });

    const netAmount = Math.round(params.total / 1.19);
    const taxAmount = params.total - netAmount;

    return {
      account_id: accountId,
      document_type_id,
      currency_id: FACTO_CHILE.currencies.CLP,
      header: {
        document_date: today,
        payment_type_id: 1, // Pago al contado / inmediato
        term_days: 0
      },
      issuer,
      customer,
      detail,
      totals: {
        net_amount: netAmount,
        tax_amount: taxAmount,
        total_amount: params.total
      }
    };
  }
}
