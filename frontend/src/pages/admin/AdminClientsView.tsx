import React, { useState, useEffect } from 'react';
import { adminApi, AdminClient } from '../../services/adminApi';
import { IconSearch, IconUsers, IconX } from '@tabler/icons-react';

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

/**
 * Listado de clientes registrados, ordenados por cuanto han comprado.
 * Sirve para identificar clientes mayoristas: quien mas gasto
 * concentrado es candidato a lista de precios propia.
 */
export const AdminClientsView: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [clientes, setClientes] = useState<AdminClient[]>([]);
  const [niveles, setNiveles] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [search, setSearch] = useState('');
  const [asignando, setAsignando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([adminApi.getClients(), adminApi.getPriceTiers()])
      .then(([c, n]) => {
        setClientes(c);
        setNiveles(n.filter((t) => t.isActive));
      })
      .catch(() => setClientes([]))
      .finally(() => setCargando(false));
  }, []);

  /** Asigna o quita el nivel de precio de un cliente. */
  const cambiarNivel = async (clienteId: string, tierId: string) => {
    setAsignando(clienteId);
    try {
      const r = await adminApi.assignPriceTier(clienteId, tierId || null);
      if (r.data.success) {
        setClientes((prev) =>
          prev.map((c) =>
            c.id === clienteId
              ? {
                  ...c,
                  priceTier: tierId ? niveles.find((n) => n.id === tierId) : null
                }
              : c
          )
        );
        setMsg({ ok: true, text: r.data.message });
        onChanged();
      } else {
        setMsg({ ok: false, text: r.data.message });
      }
    } finally {
      setAsignando(null);
    }
  };

  const filtrados = clientes.filter((c) => {
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(t) ||
      c.email.toLowerCase().includes(t) ||
      (c.rutEmpresa ?? '').toLowerCase().includes(t) ||
      (c.razonSocial ?? '').toLowerCase().includes(t)
    );
  });

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-9 h-9 border-4 border-[#0B3C73] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Clientes</h1>
        <p className="text-sm text-slate-500">
          {clientes.length} cliente{clientes.length === 1 ? '' : 's'} registrado
          {clientes.length === 1 ? '' : 's'}, ordenados por total comprado
        </p>
      </div>

      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email, RUT o razon social"
          className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73]"
        />
      </div>

      {msg && (
        <div
          className={`px-4 py-2.5 rounded-lg text-xs font-medium border flex items-center justify-between ${
            msg.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} className="cursor-pointer">
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <IconUsers className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 font-bold">Sin resultados</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Cliente</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Contacto</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Facturacion</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Nivel de precio</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Pedidos</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Total comprado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-slate-800">{c.razonSocial || c.nombre}</p>
                      {!c.razonSocial && (
                        <p className="text-[11px] text-slate-400">
                          Alta {new Date(c.createdAt).toLocaleDateString('es-CL')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs text-slate-700 truncate max-w-44">{c.email}</p>
                      {c.telefono && (
                        <p className="text-[11px] text-slate-400">{c.telefono}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.rutEmpresa ? (
                        <p className="text-xs font-mono text-slate-700">{c.rutEmpresa}</p>
                      ) : (
                        <span className="text-[11px] text-slate-400">Boleta</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={c.priceTier?.id ?? ''}
                        disabled={asignando === c.id}
                        onChange={(e) => cambiarNivel(c.id, e.target.value)}
                        className="text-[11px] px-2 py-1 border border-slate-300 rounded-lg bg-white cursor-pointer disabled:opacity-50 max-w-40"
                      >
                        <option value="">Sin nivel (precio lista)</option>
                        {niveles.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.nombre} (-{n.descuentoPercent}%)
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">
                      {c._count.orders}
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-[#0B3C73]">
                      {formatCLP(c.totalComprado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
