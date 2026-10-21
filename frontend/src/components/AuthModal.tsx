import { useModalFocus } from '../storefront/useModalFocus';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  IconX,
  IconUserPlus,
  IconLogin,
  IconMailForward,
  IconShieldLock
} from '@tabler/icons-react';

/**
 * Modal unico con tres modos: login, registro y recuperacion de contrasena.
 * Se mantiene en un solo componente para que el header solo tenga que
 * abrir/cerrar, sin importar el modo.
 */
export const AuthModal: React.FC = () => {
  const {
    authModalOpen,
    authModalMode,
    closeAuthModal,
    setAuthModalMode,
    login,
    register,
    forgotPassword
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useModalFocus(authModalOpen, 'amyb-auth-dialog', closeAuthModal);

  if (!authModalOpen) return null;

  const resetForm = () => {
    setError('');
    setInfo('');
    setPassword('');
  };

  const switchMode = (mode: 'login' | 'register' | 'forgot') => {
    resetForm();
    setAuthModalMode(mode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (authModalMode === 'login') {
        const r = await login(email, password);
        if (!r.success) setError(r.message);
      } else if (authModalMode === 'register') {
        const r = await register({ email, password, nombre, telefono });
        if (!r.success) setError(r.message);
      } else {
        const r = await forgotPassword(email);
        if (r.success) {
          setInfo(
            r.devToken
              ? `${r.message}\n\nToken de prueba (solo desarrollo): ${r.devToken}`
              : r.message
          );
        } else {
          setError(r.message);
        }
      }
    } catch {
      setError('No se pudo conectar con el servidor. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const title =
    authModalMode === 'login'
      ? 'Iniciar sesion'
      : authModalMode === 'register'
        ? 'Crear cuenta'
        : 'Recuperar contrasena';

  return (
    <div id="amyb-auth-dialog" data-amyb-modal role="dialog" aria-modal="true" aria-label="Acceso a tu cuenta" tabIndex={-1} className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={closeAuthModal}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header corporativo */}
        <div className="store-overlay-header px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <p className="text-xs text-blue-200 mt-0.5">
              {authModalMode === 'login'
                ? 'Accede a tu cuenta Amyb'
                : authModalMode === 'register'
                  ? 'Registro para clientes HORECA y B2C'
                  : 'Te enviamos un enlace por email'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
          {/* Nombre (solo registro) */}
          {authModalMode === 'register' && (
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nombre o Razon Social *
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                minLength={3}
                placeholder="Camila Soto / Gastronomia SpA"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#3E6328] focus:ring-2 focus:ring-[#3E6328]/15 transition-all"
              />
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tuempresa@correo.cl"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#3E6328] focus:ring-2 focus:ring-[#3E6328]/15 transition-all"
            />
          </div>

          {/* Contrasena */}
          {authModalMode !== 'forgot' && (
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Contrasena *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimo 8 caracteres"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#3E6328] focus:ring-2 focus:ring-[#3E6328]/15 transition-all"
              />
              {authModalMode === 'register' && (
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                  Debe incluir al menos 8 caracteres, una mayuscula, una minuscula y un numero.
                </p>
              )}
            </div>
          )}

          {/* Telefono (solo registro) */}
          {authModalMode === 'register' && (
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Telefono (opcional)
              </label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+56 9 8765 4321"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#3E6328] focus:ring-2 focus:ring-[#3E6328]/15 transition-all"
              />
            </div>
          )}

          {/* Mensajes */}
          {error && (
            <div className="mb-4 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium whitespace-pre-line break-words">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#F58220] hover:bg-[#d96f14] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm uppercase tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              'Procesando...'
            ) : authModalMode === 'login' ? (
              <>
                <IconLogin className="h-4 w-4" /> Iniciar sesion
              </>
            ) : authModalMode === 'register' ? (
              <>
                <IconUserPlus className="h-4 w-4" /> Crear mi cuenta
              </>
            ) : (
              <>
                <IconMailForward className="h-4 w-4" /> Enviar enlace
              </>
            )}
          </button>

          {/* Cambio de modo */}
          <div className="mt-5 pt-4 border-t border-slate-200 text-center space-y-2">
            {authModalMode === 'login' && (
              <>
                <p className="text-xs text-slate-500">
                  No tienes cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="text-[#3E6328] font-bold hover:underline cursor-pointer"
                  >
                    Crear una ahora
                  </button>
                </p>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-[11px] text-slate-400 hover:text-[#3E6328] hover:underline cursor-pointer"
                >
                  Olvide mi contrasena
                </button>
              </>
            )}

            {authModalMode === 'register' && (
              <p className="text-xs text-slate-500">
                Ya tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-[#3E6328] font-bold hover:underline cursor-pointer"
                >
                  Iniciar sesion
                </button>
              </p>
            )}

            {authModalMode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-xs text-[#3E6328] font-bold hover:underline cursor-pointer"
              >
                Volver al inicio de sesion
              </button>
            )}
          </div>

          {/* Aviso de seguridad */}
          <div className="mt-4 flex items-start gap-2 text-[10px] text-slate-400 leading-relaxed">
            <IconShieldLock className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>
              Tu sesion se protege con cookie httpOnly: el navegador la envia automaticamente y
              el codigo de la pagina no puede leerla.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};
