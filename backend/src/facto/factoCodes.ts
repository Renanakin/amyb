/**
 * Tabla de códigos oficiales de la API FACTO para Chile
 * Referencia: docs/revision-completa-api-facto-chile-node.md
 */

export const FACTO_CHILE = {
  countryId: 253, // Chile
  currencies: {
    CLP: 39, // Peso chileno
    USD: 5,  // Dólar estadounidense
    EUR: 38  // Euro
  },
  taxTypes: {
    iva19: {
      id: 387,
      value: 19,
      externalCode: '1',
      description: 'IVA General 19%'
    }
  },
  documentTypes: {
    invoice: {
      id: 2,
      siiCode: '33',
      name: 'Factura Electrónica'
    },
    creditNote: {
      id: 16,
      siiCode: '61',
      name: 'Nota de Crédito Electrónica'
    },
    debitNote: {
      id: 17,
      siiCode: '56',
      name: 'Nota de Débito Electrónica'
    },
    exemptInvoice: {
      id: 32,
      siiCode: '34',
      name: 'Factura Exenta Electrónica'
    },
    receipt: {
      id: 37,
      siiCode: '39',
      name: 'Boleta Electrónica'
    },
    dispatchGuide: {
      id: 54,
      siiCode: '52',
      name: 'Guía de Despacho Electrónica'
    }
  },
  units: {
    UN: 'UN',     // Unidad
    PACK: 'PACK', // Paquete
    BOX: 'BOX',   // Caja
    KG: 'KG',     // Kilogramo
    LT: 'LT'      // Litro
  },
  identificationTypes: {
    RUT: 'CL-RUT'
  },
  regions: {
    Araucania: 9,
    Metropolitana: 13
  }
};
