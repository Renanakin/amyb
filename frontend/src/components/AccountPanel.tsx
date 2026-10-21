import { useModalFocus } from '../storefront/useModalFocus';
import React, { useState, useEffect } from 'react';
import { useAuth, AuthUser } from '../context/AuthContext';
import {
  IconX,
  IconUser,
  IconLogout,
  IconDeviceLaptop,
  IconBuildingStore,
  IconMail,
  IconPhone,
  IconLock
} from '@tabler/icons-react';

interface SessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  isCurrent: boolean;
}

/**
 * Panel lateral "Mi cuenta": datos del cliente, sesiones activas y logout.
 * Muestra tambien los datos tributarios, que son los que el cliente
 * HORECA necesita tener a mano para emitir factura.
 */
export const AccountPanel: React.FC = () => {
  const { user, accountPanelOpen, setAccountPanelOpen, logout, updateProfile } = useAuth();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<AuthUser>>({});
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountPanelOpen || !user) return;
    setForm({
      nombre: user.nombre,
      telefono: user.telefono ?? '',
      rutEmpresa: user.rutEmpresa ?? '',
      razonSocial: user.razonSocial ?? '',
      giroComercial: user.giroComercial ?? '',
      direccionTributaria: user.direccionTributaria ?? '',
      comunaTributaria: user.comunaTributaria ?? ''
    });
    setMsg(null);
    setEditing(false);

    fetch('/api/auth/sessions', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.success && setSessions(d.data.sessions))
      .catch(() => {});
  }, [accountPanelOpen, user]);

  useModalFocus(accountPanelOpen && !!user, 'amyb-account-dialog', () => setAccountPanelOpen(false));

  if (!accountPanelOpen || !user) return null;

  const handleSave = async () => {
    setSaving(true);
    const r = await updateProfile(form);
    setMsg({ ok: r.success, text: r.message });
    setSaving(false);
    if (r.success) setEditing(false);
  };

  const field = (
    label: string,
    key: keyof AuthUser,
    placeholder = '',
    type = 'text'
  ) => (
    <div>
      <label className="block text-[11px] font-bold text-slate-600 mb-1">{label}</label>
      {editing ? (
        <input
          type={type}
          value={(form[key] as string) ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#3E6328] focus:ring-2 focus:ring-[#3E6328]/15"
        />
      ) : (
        <p className="text-xs text-slate-800 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 min-h-9 break-words">
          {(user[key] as string) || <span className="text-slate-400">No informado</span>}
        </p>
      )}
    </div>
  );

  return (
    <div id="amyb-account-dialog" data-amyb-modal role="dialog" aria-modal="true" aria-label="Mis datos y sesiones" tabIndex={-1} className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => setAccountPanelOpen(false)}
        aria-hidden="true"
      />

      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="store-overlay-header px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F58220] flex items-center justify-center font-bold text-lg shrink-0">
              {(user.nombre || user.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="leading-tight">
              <h2 className="text-sm font-bold">{user.nombre}</h2>
              <p className="text-[10px] text-blue-200 truncate max-w-52">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAccountPanelOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Aviso */}
          {msg && (
            <div
              className={`px-3.5 py-2.5 rounded-lg text-xs font-medium border ${
                msg.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* Datos de contacto */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <IconUser className="h-4 w-4 text-[#F58220]" /> Datos de contacto
              </h3>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[11px] text-[#3E6328] font-bold hover:underline cursor-pointer"
                >
                  Editar
                </button>
              )}
            </div>
            <div className="space-y-3">
              {field('Nombre o Razon Social', 'nombre')}
              {field('Telefono', 'telefono', '+56 9 0000 0000', 'tel')}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
              <IconMail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{user.email}</span>
            </div>
          </section>

          {/* Datos tributarios */}
          <section className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <IconBuildingStore className="h-4 w-4 text-[#F58220]" /> Datos para Factura
            </h3>
            <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
              Se usan automaticamente al elegir Factura Electrónica en el checkout, para que no
              tengas que reingresarlos en cada compra.
            </p>
            <div className="space-y-3">
              {field('RUT de la empresa', 'rutEmpresa', '77.123.456-9')}
              {field('Razon Social', 'razonSocial')}
              {field('Giro Comercial', 'giroComercial')}
              {field('Direccion Tributaria', 'direccionTributaria')}
              {field('Comuna', 'comunaTributaria', 'Temuco')}
            </div>
          </section>

          {/* Sesiones activas */}
          <section className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <IconDeviceLaptop className="h-4 w-4 text-[#F58220]" /> Dispositivos con sesion
            </h3>
            {sessions.length === 0 ? (
              <p className="text-[11px] text-slate-400">No hay sesiones activas.</p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-700 truncate">
                        {s.isCurrent ? 'Este dispositivo' : 'Otro dispositivo'}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {new Date(s.createdAt).toLocaleString('es-CL')} &middot; {s.ipAddress ?? 'IP desconocida'}
                      </p>
                    </div>
                    {s.isCurrent && (
                      <span className="shrink-0 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded-full">
                        ACTIVA
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer con acciones */}
        <div className="border-t border-slate-200 p-4 flex gap-2 shrink-0 bg-slate-50">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 py-2.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#3E6328] hover:bg-[#2E4C1E] disabled:opacity-60 text-white rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={logout}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <IconLogout className="h-4 w-4" /> Cerrar sesion
            </button>
          )}
        </div>

        {/* Aviso de cookie */}
        <div className="px-4 pb-3 flex items-start gap-2 text-[9px] text-slate-400 leading-relaxed bg-slate-50 shrink-0">
          <IconLock className="h-3 w-3 shrink-0 mt-px" />
          <span>
            La cookie de sesion es httpOnly: el codigo de la pagina no puede leerla ni robarla.
          </span>
        </div>
      </aside>
    </div>
  );
};
