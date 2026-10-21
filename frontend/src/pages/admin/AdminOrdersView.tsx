import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, AdminOrder } from '../../services/adminApi';
import { IconSearch, IconRefresh, IconReceipt, IconX } from '@tabler/icons-react';

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

const ESTADOS_LOGISTICOS = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'pagado', label: 'Pagado' },
  { id: 'despachado', label: 'Despachado' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'cancelado', label: 'Cancelado' }
];

function paymentBadge(status: string) {
  switch (status) {
    case 'pagado': return 'bg-emerald-100 text-emerald-700';
    case 'procesando': return 'bg-amber-100 text-amber-700';
    case 'rechazado': return 'bg-red-100 text-red-700';
    case 'reembolsado': return 'bg-purple-100 text-purple-700';
    // Cobrados pero sin anular: hay plata del cliente retenida y una
    // fecha limite para hacerlo. Debe saltar a la vista.
    case 'reembolso_pendiente': return 'bg-orange-100 text-orange-800 ring-1 ring-orange-400';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function orderBadge(status: string) {
  switch (status) {
    case 'despachado': return 'bg-amber-100 text-amber-700';
    case 'entregado': return 'bg-emerald-100 text-emerald-700';
    case 'cancelado': return 'bg-red-100 text-red-700';
    case 'pagado': return 'bg-blue-100 text-blue-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

/**
 * Gestion de pedidos.
 *
 * El estado de PAGO no se edita aqui a proposito: lo determina
 * Transbank. El panel solo mueve el estado logistico, que es decision
 * de la bodega. El backend igual impide despachar algo impago.
 */
export const AdminOrdersView: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [pedidos, setPedidos] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('todos');
  const [orderStatus, setOrderStatus] = useState('todos');
  const [detalle, setDetalle] = useState<AdminOrder | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await adminApi.getOrders({ search, paymentStatus, orderStatus });
      setPedidos(r.orders);
      setTotal(r.total);
    } catch {
      setMsg({ ok: false, text: 'No se pudieron cargar los pedidos.' });
    } finally {
      setCargando(false);
    }
  }, [search, paymentStatus, orderStatus]);

  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
  }, [cargar]);

  const cambiarEstado = async (o: AdminOrder, nuevo: string) => {
    const r = await adminApi.updateOrderStatus(o.orderId, nuevo);
    setMsg({ ok: r.data.success, text: r.data.message });
    if (r.data.success) {
      cargar();
      onChanged();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-500">
            Mostrando {pedidos.length} de {total}
          </p>
        </div>
        <button
          type="button"
          onClick={cargar}
          className="px-3 py-2.5 border border-slate-300 hover:bg-white rounded-lg text-slate-600 transition-colors cursor-pointer"
          title="Actualizar"
        >
          <IconRefresh className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
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

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-52">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por numero, cliente, email o telefono"
            className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-[#0B3C73]"
          />
        </div>
        <select
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm"
        >
          <option value="todos">Pago: todos</option>
          <option value="pagado">Pago: pagados</option>
          <option value="pendiente">Pago: pendientes</option>
          <option value="procesando">Pago: en proceso</option>
          <option value="rechazado">Pago: rechazados</option>
          <option value="reembolso_pendiente">Pago: anulaciones pendientes (URGENTE)</option>
          <option value="reembolsado">Pago: reembolsados</option>
        </select>
        <select
          value={orderStatus}
          onChange={(e) => setOrderStatus(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm"
        >
          <option value="todos">Estado: todos</option>
          {ESTADOS_LOGISTICOS.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-9 h-9 border-4 border-[#0B3C73] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pedidos.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <p className="text-slate-500 font-bold">Sin pedidos que coincidan</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Pedido</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Cliente</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Total</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Pago</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Estado</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-black text-slate-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pedidos.map((o) => (
                  <tr key={o.orderId} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDetalle(o)}
                        className="font-black text-[#0B3C73] hover:underline cursor-pointer"
                      >
                        {o.orderNumber}
                      </button>
                      <p className="text-[11px] text-slate-500">
                        {new Date(o.createdAt).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-700 truncate max-w-40">{o.cliente}</p>
                      <p className="text-[11px] text-slate-400 truncate max-w-40">{o.email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-[#0B3C73]">
                      {formatCLP(o.total)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${paymentBadge(o.paymentStatus)}`}>
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${orderBadge(o.orderStatus)}`}>
                        {o.orderStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {(o.dtePdfUrl || o.dteFolio) && (
                          <Link
                            to={`/documento/${o.orderId}`}
                            className="p-1.5 text-slate-500 hover:text-[#0B3C73] hover:bg-blue-50 rounded-lg"
                            title="Ver documento tributario"
                          >
                            <IconReceipt className="h-4 w-4" />
                          </Link>
                        )}
                        <select
                          value={o.orderStatus}
                          onChange={(e) => cambiarEstado(o, e.target.value)}
                          className="text-[11px] px-2 py-1 border border-slate-300 rounded-lg bg-white cursor-pointer"
                        >
                          {ESTADOS_LOGISTICOS.map((e) => (
                            <option key={e.id} value={e.id}>{e.label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detalle && <OrderDetail order={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
};

/**
 * Reenvio de correos del pedido.
 *
 * Existe porque el aviso de pago puede no salir (SMTP caido, proveedor
 * que rechaza) aunque el pago este confirmado. El cliente se queda sin
 * saber que cobro y sin factura, y sin ninguna forma de recuperarlo.
 */
const ReenviarCorreo: React.FC<{ order: AdminOrder }> = ({ order }) => {
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);

  const reenviar = async (tipo: 'factura' | 'despacho') => {
    setEnviando(tipo);
    setAviso(null);
    try {
      const r = await adminApi.resendOrderEmail(order.orderId, tipo);
      if (r.data?.success) {
        setAviso({ ok: true, text: `Correo de ${tipo} reenviado.` });
      } else {
        setAviso({ ok: false, text: r.data?.message ?? 'No se pudo reenviar.' });
      }
    } catch (e: any) {
      setAviso({ ok: false, text: e?.message ?? 'Error de red al reenviar.' });
    } finally {
      setEnviando(null);
    }
  };

  const puedeFactura = ['pagado', 'reembolsado'].includes(order.paymentStatus);
  const puedeDespacho = ['despachado', 'entregado'].includes(order.orderStatus);

  if (!puedeFactura && !puedeDespacho) return null;

  return (
    <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
      <p className="text-[11px] text-slate-500 font-bold uppercase">Correos</p>
      <div className="flex flex-wrap gap-2">
        {puedeFactura && (
          <button
            onClick={() => reenviar('factura')}
            disabled={enviando !== null}
            className="px-2.5 py-1.5 bg-[#0B3C73] text-white rounded text-[11px] font-bold hover:bg-[#0a325e] disabled:opacity-50"
          >
            {enviando === 'factura' ? 'Enviando...' : 'Reenviar factura'}
          </button>
        )}
        {puedeDespacho && (
          <button
            onClick={() => reenviar('despacho')}
            disabled={enviando !== null}
            className="px-2.5 py-1.5 bg-slate-700 text-white rounded text-[11px] font-bold hover:bg-slate-800 disabled:opacity-50"
          >
            {enviando === 'despacho' ? 'Enviando...' : 'Reenviar aviso de despacho'}
          </button>
        )}
      </div>
      {aviso && (
        <p className={aviso.ok ? 'text-emerald-700' : 'text-red-700'}>{aviso.text}</p>
      )}
      <p className="text-[11px] text-slate-500">
        El correo se arma con el folio y el PDF actuales, no con el del intento fallido.
      </p>
    </div>
  );
};

const OrderDetail: React.FC<{ order: AdminOrder; onClose: () => void }> = ({
  order,
  onClose
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-black text-slate-900">{order.orderNumber}</h2>
          <p className="text-xs text-slate-500">
            {new Date(order.createdAt).toLocaleString('es-CL')}
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer">
          <IconX className="h-5 w-5 text-slate-500" />
        </button>
      </div>

      <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[11px] text-slate-500 font-bold uppercase">Cliente</p>
            <p className="font-medium text-slate-800">{order.cliente}</p>
            <p className="text-xs text-slate-500">{order.email}</p>
            <p className="text-xs text-slate-500">{order.telefono}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-bold uppercase">Despacho</p>
            <p className="text-xs text-slate-700">{order.zona}</p>
            <p className="text-xs text-slate-500">{order.direccion}</p>
          </div>
        </div>

        {order.dteFolio && (
          <div
            className={`px-3.5 py-2.5 border rounded-lg text-xs ${
              order.dteEstadoSii === 'rechazado' || order.dteEstadoSii === 'error_permanente'
                ? 'bg-red-50 border-red-300'
                : order.dteEstadoSii === 'aprobado' || order.dteEstadoSii === 'observado'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            <span
              className={`font-black ${
                order.dteEstadoSii === 'rechazado' || order.dteEstadoSii === 'error_permanente'
                  ? 'text-red-800'
                  : 'text-blue-800'
              }`}
            >
              DTE folio {order.dteFolio}
              {order.dteEstadoSii === 'rechazado' && ' - RECHAZADO POR EL SII'}
              {order.dteEstadoSii === 'error_permanente' && ' - ERROR PERMANENTE'}
            </span>
            {order.dteStatusLabel && (
              <span
                className={`block mt-0.5 ${
                  order.dteEstadoSii === 'rechazado' || order.dteEstadoSii === 'error_permanente'
                    ? 'text-red-700'
                    : order.dteEstadoSii === 'aprobado'
                    ? 'text-emerald-700'
                    : 'text-blue-600'
                }`}
              >
                {order.dteStatusLabel}
              </span>
            )}
          </div>
        )}

        {order.ultimaTransaccion && (
          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-0.5">
            <p className="text-[11px] text-slate-500 font-bold uppercase">Transaccion Webpay</p>
            <p className="text-slate-700">
              Estado: <strong>{order.ultimaTransaccion.status}</strong>
            </p>
            {order.ultimaTransaccion.cardNumber && (
              <p className="text-slate-600">Tarjeta: ****{order.ultimaTransaccion.cardNumber}</p>
            )}
            {order.ultimaTransaccion.authorizationCode && (
              <p className="text-slate-600">Autorizacion: {order.ultimaTransaccion.authorizationCode}</p>
            )}
          </div>
        )}

        <ReenviarCorreo order={order} />

        <div>
          <p className="text-[11px] text-slate-500 font-bold uppercase mb-2">Productos</p>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {order.items.map((i, idx) => (
              <div key={idx} className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{i.nombre}</p>
                  <p className="text-[11px] text-slate-500">
                    {i.cantidad} x {formatCLP(i.precio)}
                  </p>
                </div>
                <p className="text-xs font-black text-slate-800 shrink-0">{formatCLP(i.subtotal)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1 text-xs border-t border-slate-200 pt-3">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-bold">{formatCLP(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">IVA</span>
            <span className="font-bold">{formatCLP(order.iva)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Despacho</span>
            <span className="font-bold">
              {order.costoEnvio === 0 ? 'Gratis' : formatCLP(order.costoEnvio)}
            </span>
          </div>
          <div className="flex justify-between text-sm pt-1 border-t border-slate-200">
            <span className="font-black text-slate-700">Total</span>
            <span className="font-black text-[#0B3C73]">{formatCLP(order.total)}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);
