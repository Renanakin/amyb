import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminApi, AdminDashboard } from '../services/adminApi';
import {
  IconLayoutDashboard,
  IconPackage,
  IconShoppingCart,
  IconUsers,
  IconSettings,
  IconLogout,
  IconLock,
  IconRefresh,
  IconAlertTriangle,
  IconBuildingWarehouse
} from '@tabler/icons-react';

type Vista = 'dashboard' | 'productos' | 'inventario' | 'pedidos' | 'clientes' | 'configuracion';

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

/**
 * Panel de administracion de Amyb.
 *
 * Toda la proteccion real esta en el backend: cada ruta /api/admin
 * exige rol admin. Esta pantalla solo decide que mostrar, pero nunca
 * es la unica barrera: si alguien falsea la interfaz, el servidor
 * responde 403 igual.
 */
export const AdminPanel: React.FC = () => {
  const { user, isAdmin, isLoading: authLoading, login, logout } = useAuth();

  const [vista, setVista] = useState<Vista>('dashboard');
  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  // --- Login admin ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const cargarDashboard = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setDash(await adminApi.getDashboard());
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') {
        setError('Tu cuenta no tiene permisos de administrador.');
      } else {
        setError('No se pudo cargar el panel. Revisa que el backend este arriba.');
      }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) cargarDashboard();
  }, [isAdmin, cargarDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const r = await login(email, password);
      if (!r.success) {
        setLoginError(r.message);
      } else {
        // El contexto actualiza el usuario; el useEffect carga el panel
      }
    } finally {
      setLoginLoading(false);
    }
  };

  // --- Pantalla de acceso restringido ---
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-10 h-10 border-4 border-[#0B3C73] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#051C36] text-white px-6 py-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F58220] flex items-center justify-center">
                <IconLock className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight">Panel de Administracion</h1>
                <p className="text-xs text-slate-300">Acceso restringido a personal Amyb</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="p-6 space-y-4">
              {user && !isAdmin && (
                <div className="px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-medium">
                  Estas conectado como <strong>{user.email}</strong>, pero esa cuenta no es
                  administradora. Cierra sesion e ingresa con una cuenta de personal.
                </div>
              )}

              {loginError && (
                <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                  {loginError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@amybdistribuidora.cl"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73] focus:ring-2 focus:ring-[#0B3C73]/15"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Contrasena</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73] focus:ring-2 focus:ring-[#0B3C73]/15"
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 bg-[#0B3C73] hover:bg-[#07264A] disabled:opacity-60 text-white rounded-lg font-black text-sm uppercase tracking-wide transition-colors cursor-pointer"
              >
                {loginLoading ? 'Verificando...' : 'Entrar al panel'}
              </button>
            </form>
          </div>

          <p className="text-center text-[10px] text-slate-400 mt-4 leading-relaxed">
            El acceso queda registrado. Cualquier accion dentro del panel queda asociada a tu
            cuenta.
          </p>
        </div>
      </div>
    );
  }

  // --- Panel principal ---
  const menus: { id: Vista; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Resumen', icon: IconLayoutDashboard },
    { id: 'productos', label: 'Productos', icon: IconPackage },
    { id: 'inventario', label: 'Inventario', icon: IconBuildingWarehouse },
  { id: 'pedidos', label: 'Pedidos', icon: IconShoppingCart },
    { id: 'clientes', label: 'Clientes', icon: IconUsers },
    { id: 'configuracion', label: 'Configuracion', icon: IconSettings }
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Barra lateral */}
      <aside className="w-56 shrink-0 bg-[#051C36] text-white flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <img src="/logo-amyb.png" alt="Amyb" className="h-7 brightness-0 invert" />
            <div className="leading-tight">
              <p className="text-xs font-black text-[#F58220] uppercase tracking-wider">Panel</p>
              <p className="text-[10px] text-slate-400">Amyb Distribuidora</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {menus.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setVista(m.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                  vista === m.id
                    ? 'bg-[#F58220] text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-700/50">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#0B3C73] flex items-center justify-center font-black text-xs shrink-0">
              {user.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{user.nombre}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2 bg-white/10 hover:bg-red-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            <IconLogout className="h-3.5 w-3.5" /> Salir
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 p-6 overflow-x-hidden">
        <div className="max-w-6xl mx-auto">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium flex items-center gap-2">
              <IconAlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {cargando && !dash && (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-[#0B3C73] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {vista === 'dashboard' && dash && <AdminDashboardView data={dash} onRefresh={cargarDashboard} />}
          {vista === 'productos' && <AdminProductsView onChanged={cargarDashboard} />}
          {vista === 'inventario' && <AdminInventarioView onChanged={cargarDashboard} />}
          {vista === 'pedidos' && <AdminOrdersView onChanged={cargarDashboard} />}
          {vista === 'clientes' && <AdminClientsView onChanged={cargarDashboard} />}
          {vista === 'configuracion' && <AdminSettingsView />}
        </div>
      </main>
    </div>
  );
};

// =====================================================================
// VISTA: DASHBOARD
// =====================================================================
const AdminDashboardView: React.FC<{
  data: AdminDashboard;
  onRefresh: () => void;
}> = ({ data, onRefresh }) => {
  const [cargando, setCargando] = useState(false);

  const refrescar = async () => {
    setCargando(true);
    onRefresh();
    setTimeout(() => setCargando(false), 500);
  };

  const tarjetas = [
    {
      label: 'Ventas hoy',
      value: formatCLP(data.ventas.hoy),
      sub: `${formatCLP(data.ventas.mes)} este mes`,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-800'
    },
    {
      label: 'Pedidos hoy',
      value: String(data.pedidos.hoy),
      sub: `${data.pedidos.mes} este mes`,
      color: 'bg-blue-50 border-blue-200 text-blue-800'
    },
    {
      label: 'Por despachar',
      value: String(data.pedidos.porPagar),
      sub: 'pagados sin despachar',
      color: 'bg-amber-50 border-amber-200 text-amber-800'
    },
    {
      label: 'Productos',
      value: String(data.catalogo.productosActivos),
      sub:
        data.catalogo.stockBajo > 0
          ? `${data.catalogo.stockBajo} con stock bajo`
          : 'stock sano',
      color:
        data.catalogo.stockBajo > 0
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-slate-50 border-slate-200 text-slate-800'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Resumen del negocio</h1>
          <p className="text-sm text-slate-500">
            {new Date().toLocaleDateString('es-CL', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={refrescar}
          className="flex items-center gap-2 px-3.5 py-2 border border-slate-300 hover:bg-white rounded-lg text-xs font-bold text-slate-600 transition-colors cursor-pointer"
        >
          <IconRefresh className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Tarjetas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tarjetas.map((t) => (
          <div key={t.label} className={`rounded-xl border p-4 ${t.color}`}>
            <p className="text-[11px] font-black uppercase tracking-wider opacity-70">{t.label}</p>
            <p className="text-2xl font-black mt-1">{t.value}</p>
            <p className="text-[11px] opacity-70 mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ultimos pedidos */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <h2 className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wider">
            Ultimos pedidos
          </h2>
          {data.ultimosPedidos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Aun no hay pedidos.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.ultimosPedidos.map((o) => (
                <li key={o.orderId} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-800">{o.orderNumber}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {o.cliente} &middot; {new Date(o.createdAt).toLocaleString('es-CL', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-[#0B3C73]">{formatCLP(o.total)}</p>
                    <p
                      className={`text-[10px] font-bold ${
                        o.paymentStatus === 'pagado' ? 'text-emerald-600' : 'text-slate-500'
                      }`}
                    >
                      {o.paymentStatus}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Top productos */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <h2 className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wider">
            Productos mas vendidos
          </h2>
          {data.topProductos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Sin ventas aun.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.topProductos.map((p, i) => (
                <li key={p.productId} className="px-4 py-3 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-black shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-sm font-medium text-slate-700 truncate flex-1">{p.nombre}</p>
                  <p className="text-sm font-black text-[#0B3C73] shrink-0">
                    {p.unidades} un.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-slate-400 text-center pt-2">
        {data.clientes} clientes registrados &middot; {data.pedidos.cancelados} pedidos cancelados
      </p>
    </div>
  );
};

// =====================================================================
// VISTA: PRODUCTOS
// =====================================================================
import { AdminProductsView } from './admin/AdminProductsView';
import { AdminOrdersView } from './admin/AdminOrdersView';
import { AdminClientsView } from './admin/AdminClientsView';
import { AdminSettingsView } from './admin/AdminSettingsView';
import { AdminInventarioView } from './admin/AdminInventarioView';
