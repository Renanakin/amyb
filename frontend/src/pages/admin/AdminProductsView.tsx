import React, { useState, useEffect, useCallback } from 'react';
import { adminApi, AdminProduct } from '../../services/adminApi';
import {
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconRefresh,
  IconEye,
  IconEyeOff,
  IconX
} from '@tabler/icons-react';

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

const CATEGORIAS = [
  { id: 'sushi', nombre: 'Especial Sushi' },
  { id: 'lacteos', nombre: 'Pizzerias & Quesos' },
  { id: 'abarrotes', nombre: 'Abarrotes & Aceites' },
  { id: 'congelados', nombre: 'Congelados & Mariscos' },
  { id: 'envases', nombre: 'Envases Descartables' }
];

/**
 * Gestion de productos: alta, edicion, precio por volumen, stock y baja.
 * El stock bajo se resalta porque es lo que hace perder ventas: un
 * producto agotado en la tienda sigue apareciendo en el catalogo.
 */
export const AdminProductsView: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [productos, setProductos] = useState<AdminProduct[]>([]);
  const [cargando, setCargando] = useState(true);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [estado, setEstado] = useState('todos');
  const [editando, setEditando] = useState<AdminProduct | null>(null);
  const [creando, setCreando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await adminApi.getProducts({ search, category: categoria, estado });
      setProductos(data);
    } catch (e: any) {
      setMsg({ ok: false, text: e.message === 'FORBIDDEN' ? 'Sin permisos.' : 'No se pudo cargar.' });
    } finally {
      setCargando(false);
    }
  }, [search, categoria, estado]);

  useEffect(() => {
    const t = setTimeout(cargar, 300); // espera a que el usuario termine de escribir
    return () => clearTimeout(t);
  }, [cargar]);

  const refrescar = () => {
    cargar();
    onChanged();
  };

  const toggleActivo = async (p: AdminProduct) => {
    const r = p.isActive
      ? await adminApi.deactivateProduct(p.id)
      : await adminApi.reactivateProduct(p.id);
    setMsg({ ok: r.data.success, text: r.data.message });
    refrescar();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Productos</h1>
          <p className="text-sm text-slate-500">
            {productos.length} producto{productos.length === 1 ? '' : 's'}
            {productos.filter((p) => p.stock <= 10).length > 0 &&
              ` · ${productos.filter((p) => p.stock <= 10).length} con stock bajo`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditando(null);
            setCreando(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F58220] hover:bg-[#d96f14] text-white rounded-lg text-xs font-black uppercase transition-colors cursor-pointer"
        >
          <IconPlus className="h-4 w-4" /> Nuevo producto
        </button>
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

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-52">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU o marca"
            className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73]"
          />
        </div>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73]"
        >
          <option value="todas">Todas las categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73]"
        >
          <option value="todos">Activos e inactivos</option>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
        </select>
        <button
          type="button"
          onClick={cargar}
          className="px-3 py-2.5 border border-slate-300 hover:bg-white rounded-lg text-slate-600 transition-colors cursor-pointer"
          title="Actualizar"
        >
          <IconRefresh className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-9 h-9 border-4 border-[#0B3C73] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : productos.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <p className="text-slate-500 font-bold mb-1">Sin resultados</p>
          <p className="text-sm text-slate-400">Prueba con otro filtro o crea un producto.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Producto</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">SKU</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Precio</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Escala B2B</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Stock</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productos.map((p) => (
                  <tr key={p.id} className={p.isActive ? '' : 'bg-slate-50 opacity-60'}>
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-slate-800">{p.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {p.brand} &middot; {p.format}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{p.sku}</td>
                    <td className="px-3 py-2.5 text-right font-black text-[#0B3C73]">
                      {formatCLP(p.price)}
                      {p.originalPrice && p.originalPrice > p.price && (
                        <span className="block text-[10px] text-slate-400 line-through font-normal">
                          {formatCLP(p.originalPrice)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.priceTiers.length === 0 ? (
                        <span className="text-[11px] text-slate-400">Sin escala</span>
                      ) : (
                        <div className="text-[11px] space-y-0.5">
                          {p.priceTiers.map((t) => (
                            <p key={t.minQty} className="text-slate-600">
                              <span className="font-bold">{t.minQty}+</span> →{' '}
                              {formatCLP(t.unitPrice)}
                            </p>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <StockInput producto={p} onChanged={refrescar} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditando(p);
                            setCreando(false);
                          }}
                          className="p-1.5 text-slate-500 hover:text-[#0B3C73] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <IconPencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActivo(p)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            p.isActive
                              ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={p.isActive ? 'Dar de baja' : 'Reactivar'}
                        >
                          {p.isActive ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(editando || creando) && (
        <ProductForm
          producto={editando}
          onClose={() => {
            setEditando(null);
            setCreando(false);
          }}
          onSaved={() => {
            setEditando(null);
            setCreando(false);
            refrescar();
          }}
        />
      )}
    </div>
  );
};

/** Editor de stock en la misma fila, para no abrir el formulario. */
const StockInput: React.FC<{ producto: AdminProduct; onChanged: () => void }> = ({
  producto,
  onChanged
}) => {
  const [valor, setValor] = useState(String(producto.stock));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setValor(String(producto.stock));
  }, [producto.stock]);

  const bajo = producto.stock <= 10;

  const guardar = async () => {
    const n = Number(valor);
    if (Number.isNaN(n) || n < 0 || n === producto.stock) return;
    setGuardando(true);
    await adminApi.updateStock(producto.id, n, 'Ajuste manual desde el panel');
    setGuardando(false);
    onChanged();
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        min={0}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => e.key === 'Enter' && guardar()}
        disabled={guardando}
        className={`w-16 px-2 py-1 border rounded-lg text-sm text-right font-bold focus:outline-hidden ${
          bajo ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300'
        } ${guardando ? 'opacity-50' : ''}`}
      />
      {bajo && <span className="text-[9px] font-black text-red-600">BAJO</span>}
    </div>
  );
};

/** Formulario de alta y edicion, con las escalas de precio por volumen. */
const ProductForm: React.FC<{
  producto: AdminProduct | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ producto, onClose, onSaved }) => {
  const [form, setForm] = useState<any>({
    sku: producto?.sku ?? '',
    name: producto?.name ?? '',
    category: producto?.category ?? 'sushi',
    format: producto?.format ?? '',
    description: producto?.description ?? '',
    price: producto?.price ?? 0,
    originalPrice: producto?.originalPrice ?? '',
    discountPercent: producto?.discountPercent ?? '',
    stock: producto?.stock ?? 0,
    minWholesaleQty: producto?.minWholesaleQty ?? 1,
    brand: producto?.brand ?? '',
    badge: producto?.badge ?? '',
    isOffer: producto?.isOffer ?? false
  });
  const [tiers, setTiers] = useState<{ minQty: number; unitPrice: number }[]>(
    producto?.priceTiers ?? []
  );
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const guardar = async () => {
    setError('');
    if (!form.name || !form.sku || !form.price) {
      setError('Nombre, SKU y precio son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        ...form,
        originalPrice: form.originalPrice === '' ? null : Number(form.originalPrice),
        discountPercent: form.discountPercent === '' ? null : Number(form.discountPercent),
        price: Number(form.price),
        stock: Number(form.stock),
        minWholesaleQty: Number(form.minWholesaleQty) || 1,
        priceTiers: tiers.filter((t) => t.minQty > 0 && t.unitPrice > 0)
      };
      const r = producto
        ? await adminApi.updateProduct(producto.id, payload)
        : await adminApi.createProduct(payload);
      if (!r.data.success) setError(r.data.message);
      else onSaved();
    } catch {
      setError('No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-black text-slate-900">
            {producto ? `Editar ${producto.sku}` : 'Nuevo producto'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer">
            <IconX className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Nombre *">
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="SKU *">
              <input
                value={form.sku}
                onChange={(e) => set('sku', e.target.value)}
                placeholder="LAC-GB-1360"
                className={inputCls}
              />
            </Campo>
            <Campo label="Marca">
              <input value={form.brand} onChange={(e) => set('brand', e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Formato">
              <input value={form.format} onChange={(e) => set('format', e.target.value)} placeholder="Barra 1.36 Kg" className={inputCls} />
            </Campo>
            <Campo label="Categoria">
              <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
                {CATEGORIAS.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Stock">
              <input type="number" min={0} value={form.stock} onChange={(e) => set('stock', e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Precio (CLP) *">
              <input type="number" min={0} value={form.price} onChange={(e) => set('price', e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Precio original (opcional)">
              <input type="number" min={0} value={form.originalPrice} onChange={(e) => set('originalPrice', e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Minimo mayorista">
              <input type="number" min={1} value={form.minWholesaleQty} onChange={(e) => set('minWholesaleQty', e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Etiqueta (badge)">
              <input value={form.badge} onChange={(e) => set('badge', e.target.value)} placeholder="Oferta Semanal" className={inputCls} />
            </Campo>
          </div>

          <Campo label="Descripcion">
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Campo>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isOffer}
              onChange={(e) => set('isOffer', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300"
            />
            Mostrar en Ofertas
          </label>

          {/* Escala de precios por volumen */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-black text-slate-800">Precios por volumen</h3>
                <p className="text-[11px] text-slate-500">
                  El motor de precios usa el escalon mas alto que se cumpla.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTiers([...tiers, { minQty: 20, unitPrice: Math.round(Number(form.price) * 0.95) }])}
                className="px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-[11px] font-bold text-slate-600 cursor-pointer"
              >
                + Agregar escala
              </button>
            </div>

            {tiers.length === 0 ? (
              <p className="text-[11px] text-slate-400 py-2">
                Sin escalas: se cobra el precio de lista en todos los casos.
              </p>
            ) : (
              <div className="space-y-2">
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-12">Desde</span>
                    <input
                      type="number"
                      min={1}
                      value={t.minQty}
                      onChange={(e) => {
                        const copy = [...tiers];
                        copy[i] = { ...copy[i], minQty: Number(e.target.value) };
                        setTiers(copy);
                      }}
                      className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm text-right"
                    />
                    <span className="text-xs text-slate-500">unidades a</span>
                    <input
                      type="number"
                      min={0}
                      value={t.unitPrice}
                      onChange={(e) => {
                        const copy = [...tiers];
                        copy[i] = { ...copy[i], unitPrice: Number(e.target.value) };
                        setTiers(copy);
                      }}
                      className="w-32 px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm text-right"
                    />
                    <span className="text-xs text-slate-500">CLP</span>
                    <button
                      type="button"
                      onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex-1 py-2.5 bg-[#0B3C73] hover:bg-[#07264A] disabled:opacity-60 text-white rounded-lg text-xs font-black uppercase transition-colors cursor-pointer"
          >
            {guardando ? 'Guardando...' : producto ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </div>
    </div>
  );
};

const inputCls =
  'w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73] focus:ring-2 focus:ring-[#0B3C73]/15';

const Campo: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-bold text-slate-700 mb-1.5">{label}</label>
    {children}
  </div>
);
