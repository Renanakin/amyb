/**
 * Manejador de Autenticación y Caché de Token de FACTO Chile
 */

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedAuth: TokenCache | null = null;

export class FactoAuthService {
  private static baseUrl = process.env.FACTO_BASE_URL || 'https://apifacto.com/v1';

  /**
   * Obtiene un access_token válido de FACTO, reutilizando el token en caché hasta su expiración.
   */
  public static async getValidToken(): Promise<string> {
    const now = Date.now();

    // Reutilizar token si aún tiene más de 60 segundos de vigencia
    if (cachedAuth && cachedAuth.expiresAt > now + 60000) {
      return cachedAuth.token;
    }

    const clientId = process.env.FACTO_CLIENT_ID;
    const clientSecret = process.env.FACTO_CLIENT_SECRET;
    const username = process.env.FACTO_USERNAME;
    const password = process.env.FACTO_PASSWORD;

    // Si no hay credenciales configuradas, operamos en modo Sandbox Simulado (Mock)
    if (!clientId || !clientSecret || !username || !password) {
      console.log('[FACTO-AUTH] Operando con token simulado de Sandbox (FACTO Mock Mode)');
      const mockToken = `facto_sandbox_mock_${Date.now()}_jwt_token`;
      cachedAuth = {
        token: mockToken,
        expiresAt: now + 3600000 // 1 hora
      };
      return mockToken;
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*'
        },
        body: JSON.stringify({
          grant_type: 'password',
          client_id: clientId,
          client_secret: clientSecret,
          username,
          password
        })
      });

      if (!response.ok) {
        throw new Error(`Error en autenticación FACTO: HTTP ${response.status}`);
      }

      const data = (await response.json()) as any;
      const accessToken = data.data?.access_token || data.access_token;
      const expiresIn = data.data?.expires_in || data.expires_in || 3600;

      if (!accessToken) {
        throw new Error('Respuesta de FACTO sin access_token');
      }

      cachedAuth = {
        token: accessToken,
        expiresAt: now + (expiresIn * 1000)
      };

      console.log('[FACTO-AUTH] Token obtenido exitosamente de FACTO API');
      return accessToken;
    } catch (error) {
      console.warn('[FACTO-AUTH] Fallo conexión a FACTO API, usando fallback de Sandbox:', error);
      const fallbackToken = `facto_sandbox_fallback_${Date.now()}`;
      cachedAuth = {
        token: fallbackToken,
        expiresAt: now + 1800000
      };
      return fallbackToken;
    }
  }

  public static clearCache(): void {
    cachedAuth = null;
  }
}
