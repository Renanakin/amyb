import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  IconLock,
  IconCheck,
  IconX,
  IconArrowLeft,
  IconShieldCheck
} from '@tabler/icons-react';

const API = '/api';

/**
 * Pagina para elegir una nueva contrasena.
 *
 * El token llega en el enlace del correo. Se manda al backend, que
 * valida que siga vigente y que no se haya usado antes; el backend
 * es la unica autoridad sobre esto, el frontend solo muestra el
 * resultado.
 */
export const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);
  const [loading, setLoading] = useState(false);

  // Si no hay token, no tiene sentido mostrar el formulario
  useEffect(() => {
    if (!token) {
      setError('El enlace no es valido. Solicita uno nuevo desde el inicio de sesion.');
    }
  }, [token]);

  const reglas = [
    { texto: 'Al menos 8 caracteres', ok: password.length >= 8 },
    { texto: 'Una letra mayuscula', ok: /[A-Z]/.test(password) },
    { texto: 'Una letra minuscula', ok: /[a-z]/.test(password) },
    { texto: 'Un numero', ok: /[0-9]/.test(password) }
  ];
  const cumple = reglas.every((r) => r.ok);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!cumple) {
      setError('La contrasena no cumple todos los requisitos.');
      return;
    }
    if (password !== confirmar) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();

      if (data.success) {
        setExito(true);
      } else {
        setError(data.message || 'No se pudo cambiar la contrasena.');
      }
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="store-overlay-header px-6 py-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F58220] flex items-center justify-center">
              <IconLock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                {exito ? 'Contrasena actualizada' : 'Nueva contrasena'}
              </h1>
              <p className="text-xs text-slate-300">
                {exito ? 'Ya puedes iniciar sesion' : 'Elige una clave segura para tu cuenta'}
              </p>
            </div>
          </div>

          {exito ? (
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <IconCheck className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-sm text-slate-600 mb-5 leading-relaxed">
                Tu contrasena fue cambiada y cerramos todas las sesiones abiertas por
                seguridad.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-5 py-3 bg-[#3E6328] hover:bg-[#2E4C1E] text-white rounded-lg text-sm font-bold uppercase transition-colors"
              >
                Ir al inicio de sesion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium flex items-start gap-2">
                  <IconX className="h-4 w-4 shrink-0 mt-px" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nueva contrasena
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!token}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#3E6328] focus:ring-2 focus:ring-[#3E6328]/15 disabled:bg-slate-50"
                />
              </div>

              {/* Reglas de la contrasena */}
              {password.length > 0 && (
                <ul className="space-y-1">
                  {reglas.map((r) => (
                    <li
                      key={r.texto}
                      className={`text-[11px] flex items-center gap-1.5 ${
                        r.ok ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      <IconCheck className={`h-3 w-3 ${r.ok ? '' : 'opacity-30'}`} />
                      {r.texto}
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Repetir contrasena
                </label>
                <input
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  disabled={!token}
                  autoComplete="new-password"
                  className={`w-full px-3.5 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                    confirmar && password !== confirmar
                      ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-500/15'
                      : 'border-slate-300 focus:border-[#3E6328] focus:ring-[#3E6328]/15'
                  } disabled:bg-slate-50`}
                />
                {confirmar && password !== confirmar && (
                  <p className="text-[11px] text-red-600 mt-1">Las contrasenas no coinciden.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !token || !cumple || password !== confirmar}
                className="w-full py-3 bg-[#3E6328] hover:bg-[#2E4C1E] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm uppercase tracking-wide transition-colors cursor-pointer"
              >
                {loading ? 'Guardando...' : 'Cambiar contrasena'}
              </button>

              <Link
                to="/"
                className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-[#3E6328] transition-colors"
              >
                <IconArrowLeft className="h-3.5 w-3.5" /> Volver al inicio
              </Link>
            </form>
          )}
        </div>

        <p className="flex items-start gap-2 text-[10px] text-slate-400 mt-4 leading-relaxed">
          <IconShieldCheck className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>
            Por seguridad, al cambiar tu contrasena se cierran todas las sesiones abiertas en
            otros dispositivos.
          </span>
        </p>
      </div>
    </div>
  );
};
