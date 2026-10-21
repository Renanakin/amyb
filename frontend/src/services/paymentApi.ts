/**
 * Servicio de pagos del frontend.
 *
 * IMPORTANTE: el API Key Secret de Transbank NUNCA llega aqui. Todo el
 * intercambio con la pasarela ocurre en el backend; el navegador solo
 * recibe la URL a la que debe redirigir y despues consulta el resultado.
 *
 * Flujo:
 *   1. POST /api/orders            -> crea el pedido (estado: pendiente)
 *   2. POST /api/webpay/init        -> el backend pide el token a Transbank
 *   3. el navegador se redirige a Transbank con un form POST automatico
 *   4. el cliente autoriza el pago en la pagina de Transbank
 *   5. Transbank devuelve a /webpay/return
 *   6. el backend confirma con PUT y descuenta el stock
 *   7. el frontend muestra el resultado
 */

const API_BASE = '/api';

export interface WebpayInitResponse {
  success: boolean;
  message?: string;
  data?: {
    url: string;
    token: string;
    amount: number;
    orderNumber: string;
    reused?: boolean;
  };
}

export interface WebpayResult {
  success: boolean;
  message: string;
  data?: {
    authorized: boolean;
    alreadyProcessed?: boolean;
    orderId?: string;
    orderNumber?: string;
    amount?: number;
    cardNumber?: string;
    authorizationCode?: string;
    paymentTypeCode?: string;
    installments?: number;
    transactionDate?: string;
    status?: string;
  };
}

/** Indica si un token_ws corresponde a un pago completado. */
function isTokenWs(token: string | null): boolean {
  return Boolean(token && token.length > 0);
}

export const paymentApi = {
  /**
   * Paso 2: pide al backend crear la transaccion en Transbank.
   * @param orderId id interno del pedido ya creado
   */
  async initWebpay(orderId: string): Promise<WebpayInitResponse> {
    try {
      const res = await fetch(`${API_BASE}/webpay/init`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      return await res.json();
    } catch {
      return {
        success: false,
        message: 'No se pudo conectar con el servidor de pagos.'
      };
    }
  },

  /**
   * Redirige el navegador a la pasarela de Transbank.
   *
   * Transbank exige un POST con el campo token_ws; no acepta un simple
   * window.location con query string. Por eso se crea un <form> oculto,
   * se inserta en el DOM y se envía. El navegador reemplaza la página
   * actual por la de Transbank, asi que el estado pendiente se guarda
   * en sessionStorage por si el usuario vuelve con el botón atrás.
   */
  redirectToWebpay(url: string, token: string): void {
    sessionStorage.setItem('amyb_webpay_redirect', '1');

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = token;

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  },

  /**
   * Paso 6: consulta el resultado del pago.
   * Funciona con los cuatro escenarios de retorno de Transbank.
   */
  async getResult(): Promise<WebpayResult> {
    const params = new URLSearchParams(window.location.search);

    // --- Transbank devuelve el resultado en el cuerpo del POST ---
    let tokenWs: string | null = null;
    let tbkToken: string | null = null;
    let tbkOrdenCompra: string | null = null;

    if (window.location.hash && window.location.hash.includes('=')) {
      // Algunos navegadores devuelven los parametros en el fragmento
      const hash = new URLSearchParams(window.location.hash.slice(1));
      tokenWs = hash.get('token_ws');
      tbkToken = hash.get('TBK_TOKEN');
      tbkOrdenCompra = hash.get('TBK_ORDEN_COMPRA');
    }

    tokenWs = tokenWs ?? params.get('token_ws');
    tbkToken = tbkToken ?? params.get('TBK_TOKEN');
    tbkOrdenCompra = tbkOrdenCompra ?? params.get('TBK_ORDEN_COMPRA');

    try {
      // --- Caso 1: pago completado, Transbank entrego token_ws ---
      if (isTokenWs(tokenWs)) {
        const res = await fetch(`${API_BASE}/webpay/commit`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenWs })
        });
        const data = await res.json();

        // Si el commit responde con error pero el pago ya estaba
        // confirmado (por ejemplo, la pagina se recargo y se llamo dos
        // veces), se consulta el estado de la transaccion para no
        // mostrar un rechazo a un cliente que si pago.
        if (!res.ok && data?.code !== 'UNAUTHORIZED') {
          try {
            const statusRes = await fetch(
              `${API_BASE}/webpay/status/${encodeURIComponent(tokenWs as string)}`,
              { credentials: 'include' }
            );
            const statusData = await statusRes.json();
            const remoto = statusData?.data?.transbank;

            if (remoto?.status === 'AUTHORIZED') {
              return {
                success: true,
                message: 'Pago confirmado correctamente.',
                data: {
                  authorized: true,
                  alreadyProcessed: true,
                  orderNumber: statusData?.data?.local?.orderNumber,
                  orderId: statusData?.data?.local?.orderId,
                  amount: remoto.amount,
                  cardNumber: remoto.card_detail?.card_number,
                  authorizationCode: remoto.authorization_code,
                  paymentTypeCode: remoto.payment_type_code,
                  installments: remoto.installments_number,
                  transactionDate: remoto.transaction_date
                }
              };
            }
          } catch {
            // si falla la consulta, se devuelve el error original
          }
        }

        return data;
      }

      // --- Caso 2: el usuario cancelo en la pasarela ---
      if (tbkToken) {
        const res = await fetch(`${API_BASE}/webpay/return`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ TBK_TOKEN: tbkToken })
        });
        return await res.json();
      }

      // --- Caso 3: la transaccion expiro por tiempo ---
      if (tbkOrdenCompra) {
        const res = await fetch(`${API_BASE}/webpay/return`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ TBK_ORDEN_COMPRA: tbkOrdenCompra })
        });
        return await res.json();
      }

      // --- No hay parametros: novenimos de Transbank ---
      return {
        success: false,
        message: 'No se encontro informacion de la transaccion.'
      };
    } catch {
      return {
        success: false,
        message: 'No se pudo consultar el resultado del pago.'
      };
    }
  },

  /** Limpia el marcador de redireccion una vez conocido el resultado. */
  clearRedirectFlag(): void {
    sessionStorage.removeItem('amyb_webpay_redirect');
  },

  /** Indica si veníamos de una redirección a Transbank. */
  wasRedirected(): boolean {
    return sessionStorage.getItem('amyb_webpay_redirect') === '1';
  },

  /** Consulta el estado de una transacción (reconciliación). */
  async getStatus(token: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/webpay/status/${token}`, {
        credentials: 'include'
      });
      return await res.json();
    } catch {
      return { success: false, message: 'No se pudo consultar el estado.' };
    }
  }
};
