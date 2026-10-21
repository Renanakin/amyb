/**
 * WebpayPlusService — Cliente de Transbank Webpay Plus (REST API v1.2)
 *
 * Implementa el flujo de 3 pasos exigido por Transbank:
 *   1. create()  -> genera token y URL de la pasarela
 *   2. el navegador se redirige a Transbank y el cliente autoriza el pago
 *   3. commit()  -> confirma server-to-server que el pago fue autorizado
 *
 * REGLA CRITICA: este modulo solo puede ejecutarse en el backend.
 * El API Key Secret jamas debe llegar al frontend (ver guia Transbank,
 * seccion "Zero Secret Exposure").
 */

export interface TransbankConfig {
  commerceCode: string;
  apiKeySecret: string;
  baseUrl: string;
}

export interface CreateTransactionResponse {
  token: string;
  url: string;
}

export interface CommitResponse {
  vci: string;
  amount: number;
  status: string;
  buy_order: string;
  session_id: string;
  card_detail: {
    card_number: string;
  };
  accounting_date: string;
  transaction_date: string;
  authorization_code: string;
  payment_type_code: string;
  response_code: number;
  installments_number: number;
  error_message?: string;
  error_code?: string;
}

/**
 * Plazo maximo de espera de cada llamada a Transbank.
 *
 * Sin esto, un fetch queda esperando indefinidamente: si Transbank se
 * cuelga o la red se corta, el request del cliente queda abierto para
 * siempre, el navegador gira sin respuesta y la transaccion queda en un
 * estado intermedio que nadie resuelve. Fallar rapido permite que el
 * codigo entre a la reconciliacion y averigue la verdad.
 *
 * Los valores son deliberadamente holgados: Transbank responde en
 * segundos. Si un plazo se dispara, el problema es de red, no nuestro.
 */
const TIMEOUT_MS = {
  create: 10000,
  commit: 10000,
  status: 8000,
  refund: 15000
};

export class WebpayPlusService {
  private config: TransbankConfig;

  constructor() {
    const isProduction = process.env.WEBPAY_ENVIRONMENT === 'production';

    this.config = {
      commerceCode: process.env.WEBPAY_COMMERCE_CODE || '',
      apiKeySecret: process.env.WEBPAY_API_KEY_SECRET || '',
      // Si no se define, se deduce del ambiente
      baseUrl:
        process.env.WEBPAY_BASE_URL ||
        (isProduction
          ? 'https://webpay3g.transbank.cl'
          : 'https://webpay3gint.transbank.cl')
    };
  }

  /** Indica si las credenciales estan listas para operar. */
  public isConfigured(): boolean {
    return Boolean(this.config.commerceCode && this.config.apiKeySecret);
  }

  public getBaseUrl(): string {
    return this.config.baseUrl;
  }

  private get headers(): Record<string, string> {
    return {
      'Tbk-Api-Key-Id': this.config.commerceCode,
      'Tbk-Api-Key-Secret': this.config.apiKeySecret,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Paso 1: crea la transaccion y obtiene el token + URL de la pasarela.
   *
   * buy_order: max 26 caracteres alfanumericos (limite de Transbank)
   * amount:    entero en CLP, nunca 0 ni negativo
   */
  public async createTransaction(
    buyOrder: string,
    sessionId: string,
    amount: number,
    returnUrl: string
  ): Promise<CreateTransactionResponse> {
    if (buyOrder.length > 26) {
      throw new Error(
        `buy_order excede los 26 caracteres permitidos por Transbank (${buyOrder.length}).`
      );
    }
    if (sessionId.length > 61) {
      throw new Error(
        `session_id excede los 61 caracteres permitidos por Transbank (${sessionId.length}).`
      );
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('El monto debe ser un entero positivo en CLP.');
    }

    const response = await fetch(
      `${this.config.baseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          buy_order: buyOrder,
          session_id: sessionId,
          amount,
          return_url: returnUrl
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS.create)
      }
    );

    const data = (await response.json()) as any;

    if (!response.ok) {
      throw new Error(
        `Transbank rechazo la creacion de la transaccion (HTTP ${response.status}): ` +
          `${data?.message || 'sin detalle'}`
      );
    }

    if (!data?.token || !data?.url) {
      throw new Error('Transbank respondio sin token ni url de retorno.');
    }

    return { token: data.token, url: data.url };
  }

  /**
   * Paso 3: confirma la transaccion contra Transbank.
   *
   * IMPORTANTE: este PUT es de un SOLO uso. Repetirlo sobre un token ya
   * confirmado devuelve 422/400. Por eso el llamador debe registrar el
   * estado ANTES de invocar este metodo.
   */
  public async commitTransaction(token: string): Promise<CommitResponse> {
    const response = await fetch(
      `${this.config.baseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`,
      {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(TIMEOUT_MS.commit)
      }
    );

    const data = (await response.json()) as any;

    if (!response.ok) {
      // Transbank devuelve el detalle del rechazo en el cuerpo
      throw new Error(
        `El commit de Transbank fallo (HTTP ${response.status}): ` +
          `${data?.error_message || data?.message || 'sin detalle'} ` +
          `[codigo ${data?.error_code ?? 'n/a'}]`
      );
    }

    return data as CommitResponse;
  }

  /**
   * Consulta el estado de una transaccion creada en los ultimos 7 dias.
   * Util como reconciliacion: si el commit quedo a medio camino por corte
   * de red, permite recuperar el resultado real.
   */
  public async getTransactionStatus(token: string): Promise<any> {
    const response = await fetch(
      `${this.config.baseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`,
      {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(TIMEOUT_MS.status)
      }
    );
    return await response.json();
  }

  /**
   * Anulacion del pago.
   * - Debito: solo anulacion total y dentro del mismo dia habilitacion.
   * - Credito: admite anulacion total o parcial.
   */
  public async refundTransaction(token: string, amount?: number): Promise<any> {
    const response = await fetch(
      `${this.config.baseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}/refunds`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ amount: amount ?? 0 }),
        signal: AbortSignal.timeout(TIMEOUT_MS.refund)
      }
    );
    const data = (await response.json()) as any;

    if (!response.ok) {
      throw new Error(
        `La anulacion en Transbank fallo (HTTP ${response.status}): ` +
          `${data?.error_message || data?.message || 'sin detalle'}`
      );
    }
    return data;
  }
}

/**
 * Traduce el codigo de respuesta de Transbank a un mensaje en espanol
 * comprensible para el cliente final.
 */
export function describeResponseCode(code: number): string {
  switch (code) {
    case 0:
      return 'Pago autorizado correctamente.';
    case -1:
      return 'El pago fue rechazado por el banco emisor de la tarjeta.';
    case -2:
      return 'El pago fallo por un error tecnico. Intenta nuevamente.';
    case -3:
      return 'La pasarela de pago tiene un error interno. Intenta mas tarde.';
    case -4:
      return 'La tarjeta fue rechazada por el banco emisor.';
    case -5:
      return 'El pago fue rechazado por medidas de seguridad.';
    default:
      return 'El pago no pudo completarse. Intenta con otro metodo de pago.';
  }
}
