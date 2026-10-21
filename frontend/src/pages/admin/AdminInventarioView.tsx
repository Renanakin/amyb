import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';
import { IconBuildingWarehouse, IconBook, IconRefresh, IconSearch } from '@tabler/icons-react';

/**
 * Inventario por bodega y kardex.
 *
 * Sin esto el multi-bodega existe pero es inusable: la informacion esta en
 * la base y nadie la ve. Aqui se responde "cuanto hay" y "que paso con
 * esto", que son las dos preguntas del dia a dia en una bodega.
 */

interface Bodega {
  id: string;
  code: string;
  name: string;
  address: string;
  isActive: boolean;
  productosConStock: number;
  unidadesTotales: number;
  unidadesReservadas: number;
  zonas: Array<{ id: string; name: string; isActive: boolean }>;
}

interface StockFila {
  productId: string;
  sku: string;
  nombre: string;
  format: string;
  minWholesaleQty: number;
  quantity: number;
  reserved: number;
  disponible: number;
}

interface Movimiento {
  id: string;
  createdAt: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  reason: string;
  reference: string | null;
  correctsId: string | null;
  sku: string;
  producto: string;
  bodega: string;
  bodegaCode: string;
  orderNumber: string | null;
}

const TIPOS_MOVIMIENTO: Record<string, { label: string; clase: string }> = {
  entrada: { label: 'Entrada', clase: 'bg-emerald-100 text-emerald-700' },
  salida: { label: 'Salida', clase: 'bg-blue-100 text-blue-700' },
  ajuste: { label: 'Ajuste', clase: 'bg-amber-100 text-amber-800' },
  traspaso_entrada: { label: 'Traspaso in', clase: 'bg-violet-100 text-violet-700' },
  traspaso_salida: { label: 'Traspaso out', clase: 'bg-violet-100 text-violet-700' }
};

const ETIQUETA_TIPO = (t: string) =>
  TIPOS_MOVIMIENTO[t] ?? { label: t, clase: 'bg-slate-100 text-slate-600' };

export const AdminInventarioView: React.FC<{ onChanged: () => void }> = ({
  onChanged
}) => {
  const [pestana, setPestana] = useState<'bodegas' | 'kardex'>('bodegas');
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [bodegaActiva, setBodegaActiva] = useState<string | null>(null);
  const [stock, setStock] = useState<StockFila[]>([]);
  const [buscar, setBuscar] = useState('');
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cargarBodegas = useCallback(async () => {
    setCargando(true);
    try {
      const r = await adminApi.getBodegas();
      const lista: Bodega[] = r.data.data ?? [];
      setBodegas(lista);
      setBodegaActiva((prev) =>
        prev && lista.some((b) => b.id === prev)
          ? prev
          : lista[0]?.id ?? null
      );
      setMsg(null);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'No se pudieron cargar las bodegas.' });
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarStock = useCallback(async () => {
    if (!bodegaActiva) return;
    const r = await adminApi.getStockBodega(
      bodegaActiva,
      buscar.trim() || undefined
    );
    setStock(r.data.data?.stocks ?? []);
  }, [bodegaActiva, buscar]);

  const cargarKardex = useCallback(async () => {
    const r = await adminApi.getKardex(filtroTipo || undefined);
    setMovimientos(r.data.data ?? []);
  }, [filtroTipo]);

  useEffect(() => {
    cargarBodegas();
  }, [cargarBodegas]);

  useEffect(() => {
    if (pestana === 'bodegas') {
      const t = setTimeout(cargarStock, buscar ? 350 : 0);
      return () => clearTimeout(t);
    }
  }, [pestana, cargarStock]);

  useEffect(() => {
    if (pestana === 'kardex') cargarKardex();
  }, [pestana, cargarKardex]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900">Inventario</h2>
          <p className="text-xs text-slate-500">
            Stock por bodega y libro de movimientos. El kardex no se edita:
            un asiento mal se corrige con otro que lo referencia.
          </p>
        </div>
        <button
          onClick={() => {
            cargarBodegas();
            onChanged();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200"
        >
          <IconRefresh size={14} /> Actualizar
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {([
          ['bodegas', 'Bodegas', IconBuildingWarehouse],
          ['kardex', 'Kardex', IconBook]
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold border-b-2 -mb-px ${
              pestana === id
                ? 'border-[#0B3C73] text-[#0B3C73]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {msg && (
        <p
          className={`text-xs font-bold ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}
        >
          {msg.text}
        </p>
      )}

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-9 h-9 border-4 border-[#0B3C73] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pestana === 'bodegas' ? (
        <div className="space-y-4">
          {bodegas.length === 0 ? (
            <p className="text-sm text-slate-500 bg-white rounded-xl border border-slate-200 p-6">
              No hay bodegas configuradas.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bodegas.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBodegaActiva(b.id)}
                    className={`text-left p-3.5 rounded-xl border-2 transition ${
                      bodegaActiva === b.id
                        ? 'border-[#0B3C73] bg-white'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-[11px] font-black text-slate-400 uppercase">
                      {b.code}
                    </p>
                    <p className="text-sm font-black text-slate-800">{b.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{b.address}</p>
                    <div className="flex gap-3 mt-2 text-[11px]">
                      <span className="text-slate-600">
                        <strong>{b.unidadesTotales}</strong> unidades
                      </span>
                      <span className="text-slate-500">
                        {b.productosConStock} productos
                      </span>
                      {b.unidadesReservadas > 0 && (
                        <span className="text-amber-600">
                          {b.unidadesReservadas} reservadas
                        </span>
                      )}
                    </div>
                    {b.zonas.length > 0 && (
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        Cubre: {b.zonas.map((z) => z.name).join(', ')}
                      </p>
                    )}
                  </button>
                ))}
              </div>

              <div className="relative">
                <IconSearch
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar producto en esta bodega"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['SKU', 'Producto', 'Bodega', 'Disponible', 'Reservado', 'Min. venta'].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-3.5 py-2.5 text-left text-[11px] font-black uppercase text-slate-500"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stock.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          {buscar
                            ? 'Ningun producto coincide con la busqueda.'
                            : 'Esta bodega no tiene stock registrado.'}
                        </td>
                      </tr>
                    ) : (
                      stock.map((f) => (
                        <tr key={f.productId} className="hover:bg-slate-50">
                          <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">
                            {f.sku}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-800">{f.nombre}</td>
                          <td className="px-3.5 py-2.5 text-slate-600">
                            {bodegas.find((b) => b.id === bodegaActiva)?.name ?? ''}
                          </td>
                          <td
                            className={`px-3.5 py-2.5 font-black ${
                              f.disponible === 0 ? 'text-red-600' : 'text-slate-800'
                            }`}
                          >
                            {f.disponible}
                            {f.reserved > 0 && (
                              <span className="text-[11px] font-bold text-amber-600">
                                {' '}
                                ({f.quantity} total)
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-600">
                            {f.reserved > 0 ? f.reserved : '-'}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-500">
                            {f.minWholesaleQty}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
            >
              <option value="">Todos los movimientos</option>
              <option value="entrada">Entradas (compras, devoluciones)</option>
              <option value="salida">Salidas (ventas, mermas)</option>
              <option value="ajuste">Ajustes</option>
            </select>
            <p className="text-xs text-slate-500">
              {movimientos.length} movimientos
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Fecha', 'Tipo', 'SKU', 'Cantidad', 'Saldo', 'Motivo', 'Bodega', 'Pedido'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-[11px] font-black uppercase text-slate-500"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Sin movimientos.
                    </td>
                  </tr>
                ) : (
                  movimientos.map((m) => {
                    const et = ETIQUETA_TIPO(m.type);
                    return (
                      <tr
                        key={m.id}
                        className={`hover:bg-slate-50 ${
                          m.correctsId ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(m.createdAt).toLocaleString('es-CL', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black ${et.clase}`}
                          >
                            {et.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                          {m.sku}
                        </td>
                        <td
                          className={`px-3 py-2.5 font-black ${
                            m.quantity < 0 ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {m.quantity > 0 ? '+' : ''}
                          {m.quantity}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-700">
                          {m.balanceAfter}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {m.reason}
                          {m.correctsId && (
                            <span className="block text-[11px] text-amber-700">
                              corrige un movimiento anterior
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{m.bodegaCode}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {m.orderNumber ?? '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-500">
            Un ajuste aparece con fondo ambarillo: es un asiento que corrige
            otro anterior, sin borrarlo ni reescribir la historia.
          </p>
        </div>
      )}
    </div>
  );
};