import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * Contexto de autenticacion del cliente.
 *
 * El JWT viaja en una cookie httpOnly que el navegador envia solo.
 * Por eso el frontend NUNCA ve el token: cada peticion incluye
 * `credentials: 'include'` y el backend resuelve la sesion.
 */

export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  telefono?: string | null;
  role: string;
  rutEmpresa?: string | null;
  razonSocial?: string | null;
  giroComercial?: string | null;
  direccionTributaria?: string | null;
  comunaTributaria?: string | null;
  /**
   * Nivel de precio asignado. Si tiene, el cliente ve un descuento
   * sobre TODA la tienda. El cobro real lo decide el servidor, asi que
   * esto solo afecta lo que se muestra.
   */
  priceTier?: {
    id: string;
    nombre: string;
    descuentoPercent: number;
    aplicaSobreEscalon: boolean;
  } | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  authModalOpen: boolean;
  authModalMode: 'login' | 'register' | 'forgot';
  accountPanelOpen: boolean;

  openAuthModal: (mode?: 'login' | 'register' | 'forgot') => void;
  closeAuthModal: () => void;
  setAuthModalMode: (mode: 'login' | 'register' | 'forgot') => void;
  setAccountPanelOpen: (open: boolean) => void;

  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (data: {
    email: string;
    password: string;
    nombre: string;
    telefono?: string;
  }) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string; devToken?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (data: Partial<AuthUser>) => Promise<{ success: boolean; message: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = '/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);

  // Al cargar la pagina, preguntar al servidor si hay sesion activa.
  // El servidor es la unica fuente de verdad: el frontend no guarda
  // el token, asi que no puede decidir por su cuenta quien esta conectado.
  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.success) setUser(data.data.user);
      })
      .catch(() => {
        // Sin backend: se opera como visitante
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include', // essential: envia la cookie de sesion
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (data.success) {
        setUser(data.data.user);
        setAuthModalOpen(false);
      }
      return { success: data.success, message: data.message };
    },
    [request]
  );

  const register = useCallback(
    async (data: { email: string; password: string; nombre: string; telefono?: string }) => {
      const res = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (res.data.success) {
        setUser(res.data.data.user);
        setAuthModalOpen(false);
      }
      return { success: res.data.success, message: res.data.message };
    },
    [request]
  );

  const logout = useCallback(async () => {
    await request('/auth/logout', { method: 'POST' });
    setUser(null);
    setAccountPanelOpen(false);
  }, [request]);

  const forgotPassword = useCallback(
    async (email: string) => {
      const { data } = await request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      return {
        success: data.success,
        message: data.message,
        devToken: data.devToken
      };
    },
    [request]
  );

  const resetPassword = useCallback(
    async (token: string, password: string) => {
      const { data } = await request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      });
      if (data.success) setAuthModalMode('login');
      return { success: data.success, message: data.message };
    },
    [request]
  );

  const updateProfile = useCallback(
    async (data: Partial<AuthUser>) => {
      const res = await request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      if (res.data.success) setUser(res.data.data.user);
      return { success: res.data.success, message: res.data.message };
    },
    [request]
  );

  const refreshUser = useCallback(async () => {
    const { data } = await request('/auth/me');
    setUser(data?.success ? data.data.user : null);
  }, [request]);

  const openAuthModal = useCallback((mode: 'login' | 'register' | 'forgot' = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isAdmin: user?.role === 'admin',
        isLoading,
        authModalOpen,
        authModalMode,
        accountPanelOpen,
        openAuthModal,
        closeAuthModal: () => setAuthModalOpen(false),
        setAuthModalMode,
        setAccountPanelOpen,
        login,
        register,
        logout,
        forgotPassword,
        resetPassword,
        updateProfile,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
