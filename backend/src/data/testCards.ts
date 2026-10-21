/**
 * Catalogo oficial de tarjetas de prueba de Transbank.
 *
 * Fuente: https://www.transbankdevelopers.cl/documentacion/como_empezar
 * Ambiente: Integracion (https://webpay3gint.transbank.cl)
 *
 * IMPORTANTE: estas tarjetas solo existen en el ambiente de pruebas.
 * En produccion se usan tarjetas reales y nunca deben quedar en el
 * codigo una lista como esta.
 */

export type CardOutcome = 'aprobada' | 'rechazada';
export type CardType = 'credito' | 'debito' | 'prepago';

export interface TestCard {
  pan: string;
  descripcion: string;
  tipo: CardType;
  /** La tarjeta exige CVV para completar la transaccion. */
  requiereCvv: boolean;
  /** La tarjeta pide codigo de autorizacion (AMEX). */
  pideAutorizacion: boolean;
  cvv?: string;
  resultado: CardOutcome;
}

/**
 * Credenciales del banco simulado (TEST COMMERCE BANK).
 * Se solicitan cuando Transbank pide RUT y clave del tarjetahabiente.
 */
export const BANCO_PRUEBA = {
  rut: '11111111', // 11.111.111-1
  clave: '123'
} as const;

/**
 * Tarjetas oficiales del ambiente de integracion de Transbank.
 */
export const TARJETAS_PRUEBA: TestCard[] = [
  {
    pan: '4051885600446623',
    descripcion: 'VISA Credito',
    tipo: 'credito',
    requiereCvv: true,
    pideAutorizacion: false,
    cvv: '123',
    resultado: 'aprobada'
  },
  {
    pan: '370000000002032',
    descripcion: 'AMEX Credito',
    tipo: 'credito',
    requiereCvv: true,
    pideAutorizacion: true,
    cvv: '1234',
    resultado: 'aprobada'
  },
  {
    pan: '5186059559590568',
    descripcion: 'MASTERCARD Credito',
    tipo: 'credito',
    requiereCvv: true,
    pideAutorizacion: false,
    cvv: '123',
    resultado: 'rechazada'
  },
  {
    pan: '4051884239937763',
    descripcion: 'Redcompra Debito',
    tipo: 'debito',
    requiereCvv: false,
    pideAutorizacion: false,
    resultado: 'aprobada'
  },
  {
    pan: '4511346660037060',
    descripcion: 'Redcompra Debito Alternativa',
    tipo: 'debito',
    requiereCvv: false,
    pideAutorizacion: false,
    resultado: 'aprobada'
  },
  {
    pan: '5186008541233829',
    descripcion: 'Redcompra Debito Rechazada',
    tipo: 'debito',
    requiereCvv: false,
    pideAutorizacion: false,
    resultado: 'rechazada'
  },
  {
    pan: '4051886000056590',
    descripcion: 'Prepago VISA',
    tipo: 'prepago',
    requiereCvv: true,
    pideAutorizacion: false,
    cvv: '123',
    resultado: 'aprobada'
  },
  {
    pan: '5186174110629480',
    descripcion: 'Prepago MASTERCARD',
    tipo: 'prepago',
    requiereCvv: true,
    pideAutorizacion: false,
    cvv: '123',
    resultado: 'rechazada'
  }
];

/**
 * Codigos de respuesta de Transbank y su significado.
 * El backend debe traducir cada uno a un mensaje util para el cliente.
 */
export const RESPONSE_CODES: { codigo: number; nombre: string; mensaje: string }[] = [
  { codigo: 0, nombre: 'AUTHORIZED', mensaje: 'Pago autorizado correctamente.' },
  { codigo: -1, nombre: 'REJECTED_BY_ISSUER', mensaje: 'Rechazado por el banco emisor.' },
  { codigo: -2, nombre: 'ERROR', mensaje: 'Error tecnico, intento nuevamente.' },
  { codigo: -3, nombre: 'INVALID_REQUEST', mensaje: 'Solicitud invalida a la pasarela.' },
  { codigo: -4, nombre: 'REJECTED_BY_ISSUER', mensaje: 'Tarjeta rechazada por el emisor.' },
  { codigo: -5, nombre: 'DECLINED', mensaje: 'Rechazada por medidas de seguridad.' }
];

/**
 * Estados que devuelve GET /transactions/{token} en Transbank.
 */
export const ESTADOS_TRANSACCION = [
  'INITIALIZED',
  'AUTHORIZED',
  'REJECTED',
  'ABORTED',
  'TIMED_OUT',
  'NULLIFIED',
  'REFUNDED'
] as const;

/**
 * Estados que guarda Amyb en la columna webpay_transactions.status.
 *
 * OJO: no coincide con el nombre de Transbank a proposito.
 *   Transbank  INITIALIZED  ->  Amyb  INITIATED
 * La razon: 'INITIATED' se escribe al crear la transaccion (antes de que
 * el cliente pague nada) y 'INITIALIZED' en Transbank significa lo mismo
 * pero la palabra suena a evento ya ocurrido. Mantener los separados
 * evita compararlos por error en el codigo.
 */
export const ESTADOS_LOCALES = [
  'INITIATED',   // transaccion creada, el cliente aun no paga
  'COMMITTED',   // commit en curso contra Transbank
  'AUTHORIZED',  // pago confirmado
  'REJECTED',    // el banco rechazo
  'ABORTED',     // el usuario cancelo en la pasarela
  'TIMED_OUT'    // la transaccion expiro
] as const;

/** Traduce el estado de Transbank al estado local de Amyb. */
export function estadoLocalDesdeTransbank(estadoTransbank: string): string {
  switch (estadoTransbank) {
    case 'AUTHORIZED':
      return 'AUTHORIZED';
    case 'REJECTED':
      return 'REJECTED';
    case 'ABORTED':
      return 'ABORTED';
    case 'TIMED_OUT':
      return 'TIMED_OUT';
    case 'INITIALIZED':
    default:
      return 'INITIATED';
  }
}
