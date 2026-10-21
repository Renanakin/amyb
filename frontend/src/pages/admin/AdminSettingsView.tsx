import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  IconPlus,
  IconTrash,
  IconPencil,
  IconMapPin,
  IconDeviceFloppy,
  IconX,
  IconCheck,
  IconTruck,
  IconRefresh
} from '@tabler/icons-react';

interface PriceTier {
  id: string;
  nombre: string;
  descripcion: string | null;
  descuentoPercent: number;
  aplicaSobreEscalon: boolean;
  color: string | null;
  isActive: boolean;
  clientesAsignados: number;
}

interface DeliveryConfig {
  nombreLocal: string;
  bodegaDireccion: string;
  bodegaLat: number | null;
  bodegaLng: number | null;
  radioMaximoKm: number;
  bloquearFueraDeRadio: boolean;
  despachoBase: number;
  costoPorKm: number;
  despachoGratisDesde: number;
  googleMapsApiKey: string | null;
  googleMapsConfigurado: boolean;
}

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

/**
 * Panel de configuracion comercial.
 *
 * Dos secciones:
 *   - Niveles de precio: quien recibe que descuento
 *   - Cobertura de despacho: hasta donde llega la bodega
 */
export const AdminSettingsView: React.FC = () => {
  const [tab, setTab] = useState<'niveles' | 'despacho'>('niveles');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Configuracion</h1>
        <p className="text-sm text-slate-500">
          Niveles de precio por cliente y cobertura del despacho.
        </p>
      </div>

      {/* Pestanas */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('niveles')}
          className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-colors cursor-pointer ${
            tab === 'niveles'
              ? 'bg-[#0B3C73] text-white'
              : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Niveles de precio
        </button>
        <button
          type="button"
          onClick={() => setTab('despacho')}
          className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-colors cursor-pointer ${
            tab === 'despacho'
              ? 'bg-[#0B3C73] text-white'
              : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Cobertura de despacho
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

      {tab === 'niveles' ? (
        <PriceTiersView onMsg={setMsg} />
      ) : (
        <DeliveryConfigView onMsg={setMsg} />
      )}
    </div>
  );
};

// =====================================================================
// NIVELES DE PRECIO
// =====================================================================
const PriceTiersView: React.FC<{
  onMsg: (m: { ok: boolean; text: string }) => void;
}> = ({ onMsg }) => {
  const [niveles, setNiveles] = useState<PriceTier[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<PriceTier | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setNiveles(await adminApi.getPriceTiers());
    } catch {
      onMsg({ ok: false, text: 'No se pudieron cargar los niveles.' });
    } finally {
      setCargando(false);
    }
  }, [onMsg]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-9 h-9 border-4 border-[#0B3C73] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Niveles de cliente
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              El descuento se aplica sobre el precio ya negociado por volumen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditando(null);
              setCreando(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#F58220] hover:bg-[#d96f14] text-white rounded-lg text-[11px] font-black uppercase transition-colors cursor-pointer"
          >
            <IconPlus className="h-3.5 w-3.5" /> Nuevo nivel
          </button>
        </div>

        {niveles.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            No hay niveles creados. Crea el primero para asignar descuentos.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {niveles.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3.5 flex items-center justify-between gap-4 ${
                  n.isActive ? '' : 'bg-slate-50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-sm shrink-0"
                    style={{ background: n.color || '#0B3C73' }}
                  >
                    -{n.descuentoPercent}%
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm">
                      {n.nombre}
                      {!n.isActive && (
                        <span className="ml-2 text-[10px] font-black text-slate-400 uppercase">
                          inactivo
                        </span>
                      )}
                    </p>
                    {n.descripcion && (
                      <p className="text-[11px] text-slate-500 truncate">{n.descripcion}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {n.clientesAsignados} cliente
                      {n.clientesAsignados === 1 ? '' : 's'} &middot;{' '}
                      {n.aplicaSobreEscalon
                        ? 'se aplica sobre el precio de volumen'
                        : 'se aplica sobre el precio de lista'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditando(n);
                    setCreando(false);
                  }}
                  className="p-1.5 text-slate-500 hover:text-[#0B3C73] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Editar"
                >
                  <IconPencil className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(editando || creando) && (
        <TierForm
          nivel={editando}
          onClose={() => {
            setEditando(null);
            setCreando(false);
          }}
          onSaved={(texto) => {
            setEditando(null);
            setCreando(false);
            onMsg({ ok: true, text: texto });
            cargar();
          }}
        />
      )}
    </>
  );
};

const TierForm: React.FC<{
  nivel: PriceTier | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}> = ({ nivel, onClose, onSaved }) => {
  const [form, setForm] = useState({
    nombre: nivel?.nombre ?? '',
    descripcion: nivel?.descripcion ?? '',
    descuentoPercent: String(nivel?.descuentoPercent ?? 5),
    aplicaSobreEscalon: nivel?.aplicaSobreEscalon ?? true,
    color: nivel?.color ?? '#0B3C73',
    isActive: nivel?.isActive ?? true
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setError('');
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    const pct = Number(form.descuentoPercent);
    if (Number.isNaN(pct) || pct < 0 || pct > 90) {
      setError('El descuento debe estar entre 0 y 90.');
      return;
    }

    setGuardando(true);
    try {
      if (nivel) {
        const r = await adminApi.updatePriceTier(nivel.id, {
          ...form,
          descuentoPercent: pct
        });
        if (!r.data.success) setError(r.data.message);
        else onSaved(`Nivel "${form.nombre}" actualizado.`);
      } else {
        const r = await adminApi.createPriceTier({
          ...form,
          descuentoPercent: pct
        });
        if (!r.data.success) setError(r.data.message);
        else onSaved(`Nivel "${form.nombre}" creado.`);
      }
    } finally {
      setGuardando(false);
    }
  };

  const inputCls =
    'w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-black text-slate-900">
            {nivel ? `Editar ${nivel.nombre}` : 'Nuevo nivel de precio'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <IconX className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Cliente Mayorista"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Descuento (%)
            </label>
            <input
              type="number"
              min={0}
              max={90}
              step="0.5"
              value={form.descuentoPercent}
              onChange={(e) => setForm({ ...form, descuentoPercent: e.target.value })}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Descripcion
            </label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Color</label>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-16 h-10 border border-slate-300 rounded-lg cursor-pointer"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.aplicaSobreEscalon}
              onChange={(e) => setForm({ ...form, aplicaSobreEscalon: e.target.checked })}
              className="w-4 h-4 mt-0.5 rounded border-slate-300"
            />
            <span>
              Aplicar sobre el precio de volumen
              <span className="block text-[11px] text-slate-500">
                Recomendado. Si el cliente ya recibio un mejor precio por comprar
                en cantidad, el descuento se suma sobre ese y no lo pierde.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300"
            />
            Nivel activo
          </label>
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
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// COBERTURA DE DESPACHO
// =====================================================================
const DeliveryConfigView: React.FC<{
  onMsg: (m: { ok: boolean; text: string }) => void;
}> = ({ onMsg }) => {
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [prueba, setPrueba] = useState<any>(null);
  const [dirPrueba, setDirPrueba] = useState('');
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    adminApi
      .getDeliveryConfig()
      .then(setConfig)
      .catch(() => onMsg({ ok: false, text: 'No se pudo cargar la configuración.' }))
      .finally(() => setCargando(false));
  }, [onMsg]);

  if (cargando || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-9 h-9 border-4 border-[#0B3C73] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await adminApi.updateDeliveryConfig({
        nombreLocal: config.nombreLocal,
        bodegaDireccion: config.bodegaDireccion,
        radioMaximoKm: config.radioMaximoKm,
        bloquearFueraDeRadio: config.bloquearFueraDeRadio,
        despachoBase: config.despachoBase,
        costoPorKm: config.costoPorKm,
        despachoGratisDesde: config.despachoGratisDesde
      });
      onMsg({ ok: r.data.success, text: r.data.message });
    } finally {
      setGuardando(false);
    }
  };

  const probarDireccion = async () => {
    if (!dirPrueba.trim()) return;
    setProbando(true);
    try {
      const r = await adminApi.testAddress(dirPrueba, 50000);
      setPrueba(r.data.data);
    } finally {
      setProbando(false);
    }
  };

  const inputCls =
    'w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73]';

  return (
    <div className="space-y-4">
      {/* Estado de Google Maps */}
      <div
        className={`rounded-xl border p-4 flex items-start gap-3 ${
          config.googleMapsConfigurado
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}
      >
        <IconMapPin
          className={`h-5 w-5 shrink-0 mt-0.5 ${
            config.googleMapsConfigurado ? 'text-emerald-600' : 'text-amber-600'
          }`}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">
            {config.googleMapsConfigurado
              ? 'Google Maps conectado'
              : 'Google Maps sin configurar'}
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {config.googleMapsConfigurado
              ? 'Las distancias se calculan con rutas reales de Google.'
              : 'Sin API Key el sistema usa distancia en linea recta y marca el resultado como aproximado. La tienda sigue funcionando.'}
          </p>
        </div>
      </div>

      {/* Configuracion */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <IconTruck className="h-3.5 w-3.5" /> Cobertura y despacho
          </h2>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Nombre del local
            </label>
            <input
              value={config.nombreLocal}
              onChange={(e) => setConfig({ ...config, nombreLocal: e.target.value })}
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Direccion de la bodega
            </label>
            <input
              value={config.bodegaDireccion}
              onChange={(e) => setConfig({ ...config, bodegaDireccion: e.target.value })}
              className={inputCls}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Punto de partida de todas las rutas. Se usa para calcular la distancia.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Radio maximo de entrega (km)
            </label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={config.radioMaximoKm}
              onChange={(e) =>
                setConfig({ ...config, radioMaximoKm: Number(e.target.value) })
              }
              className={inputCls}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              0 = sin limite
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Despacho base (CLP)
            </label>
            <input
              type="number"
              min={0}
              value={config.despachoBase}
              onChange={(e) =>
                setConfig({ ...config, despachoBase: Number(e.target.value) })
              }
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Costo por kilometro
            </label>
            <input
              type="number"
              min={0}
              value={config.costoPorKm}
              onChange={(e) =>
                setConfig({ ...config, costoPorKm: Number(e.target.value) })
              }
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Despacho gratis desde (CLP)
            </label>
            <input
              type="number"
              min={0}
              value={config.despachoGratisDesde}
              onChange={(e) =>
                setConfig({ ...config, despachoGratisDesde: Number(e.target.value) })
              }
              className={inputCls}
            />
          </div>

          <label className="sm:col-span-2 flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.bloquearFueraDeRadio}
              onChange={(e) =>
                setConfig({ ...config, bloquearFueraDeRadio: e.target.checked })
              }
              className="w-4 h-4 mt-0.5 rounded border-slate-300"
            />
            <span>
              Bloquear la venta si la direccion esta fuera del radio
              <span className="block text-[11px] text-slate-500">
                Recomendado. Sin esto, el cliente completa la compra y la
                bodega despues descubre que no puede llegar.
              </span>
            </span>
          </label>
        </div>

        <div className="px-4 py-3 border-t border-slate-200">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0B3C73] hover:bg-[#07264A] disabled:opacity-60 text-white rounded-lg text-xs font-black uppercase transition-colors cursor-pointer"
          >
            {guardando ? <IconRefresh className="h-3.5 w-3.5 animate-spin" /> : <IconDeviceFloppy className="h-3.5 w-3.5" />}
            Guardar configuracion
          </button>
        </div>
      </div>

      {/* Probador de direcciones */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">
            Probar una direccion
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Verifica si una direccion cae dentro del radio, sin crear un pedido.
          </p>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={dirPrueba}
              onChange={(e) => setDirPrueba(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && probarDireccion()}
              placeholder="Av. Argentina 1234, Temuco"
              className={inputCls}
            />
            <button
              type="button"
              onClick={probarDireccion}
              disabled={probando || !dirPrueba.trim()}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg text-xs font-black uppercase transition-colors cursor-pointer shrink-0"
            >
              {probando ? '...' : 'Probar'}
            </button>
          </div>

          {prueba && (
            <div
              className={`rounded-lg border p-3.5 ${
                prueba.ventaBloqueada
                  ? 'bg-red-50 border-red-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {prueba.ventaBloqueada ? (
                  <IconX className="h-4 w-4 text-red-600" />
                ) : (
                  <IconCheck className="h-4 w-4 text-emerald-600" />
                )}
                <p className="text-sm font-black text-slate-800">
                  {prueba.ventaBloqueada ? 'Fuera de cobertura' : 'Dentro de cobertura'}
                </p>
              </div>
              <p className="text-[11px] text-slate-700">{prueba.mensaje}</p>
              <div className="mt-2.5 pt-2.5 border-t border-black/10 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <p className="text-slate-500">Distancia</p>
                  <p className="font-black text-slate-800">{prueba.distanciaKm} km</p>
                </div>
                <div>
                  <p className="text-slate-500">Radio</p>
                  <p className="font-black text-slate-800">{prueba.radioMaximoKm} km</p>
                </div>
                <div>
                  <p className="text-slate-500">Despacho</p>
                  <p className="font-black text-slate-800">
                    {prueba.costoDespacho === 0 ? 'Gratis' : formatCLP(prueba.costoDespacho)}
                  </p>
                </div>
              </div>
              {prueba.aproximado && (
                <p className="text-[10px] text-amber-700 mt-2">
                  Distancia aproximada en linea recta (sin Google Maps configurado).
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
