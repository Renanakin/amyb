import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import {
  IconPackage,
  IconReceipt,
  IconTruck,
  IconCheck,
  IconX,
  IconClock,
  IconLogin,
  IconRefresh,
  IconMail
} from '@tabler/icons-react';

interface OrderItem {
  id: string;
  name: string;
  format: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface OrderSummary {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  paymentStatus: string;
  orderStatus: string;
  paymentMethod: string;
  total: number;
  itemCount: number;
  /** Detalle de lo comprado. Viene con el historial, no se pide aparte. */
  items: OrderItem[];
  dteFolio?: string;
  dtePdfUrl?: string;
  shippingZoneName?: string;
}

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

function paymentStatusInfo(status: string) {
  switch (status) {
    case 'pagado': return { label: 'Pago confirmado', color: 'bg-emerald-100 text-emerald-700' };
    case 'procesando': return { label: 'Pago en proceso', color: 'bg-amber-100 text-amber-700' };
    case 'rechazado': return { label: 'Pago rechazado', color: 'bg-red-100 text-red-700' };
    case 'reembolsado': return { label: 'Reembolsado', color: 'bg-purple-100 text-purple-700' };
    default: return { label: 'Sin pagar', color: 'bg-slate-100 text-slate-600' };
  }
}

export const MyOrdersPage: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading, openAuthModal } = useAuth();
  const { addToCart, showToast } = useCart();

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    fetch('/api/orders/mine', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success) setOrders(data.data.orders);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  /**
   * Vuelve a agregar al carrito todo lo del pedido anterior.
   * Es la funcion de mayor valor en un e-commerce B2B: el cliente
   * HORECA repide el mismo pedido cada semana.
   */
  const handleReorder = async (orderId: string) => {
    setReordering(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: 'include' });
      const data = await res.json();
      if (!data?.success) {
        showToast('No se pudo leer el pedido');
        return;
      }

      let agregados = 0;
      let omitidos = 0;

      for (const item of data.data.items) {
        const prod = await fetch(`/api/products/${item.id}`);
        const prodData = await prod.json();
        if (prodData?.success) {
          addToCart(prodData.data, item.quantity);
          agregados++;
        } else {
          omitidos++;
        }
      }

      if (omitidos > 0) {
        showToast(`${agregados} productos agregados, ${omitidos} ya no disponibles`);
      } else {
        showToast(`${agregados} productos agregados al carrito`);
      }
    } catch {
      showToast('Error al repetir el pedido');
    } finally {
      setReordering(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#3E6328] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
          <IconPackage className="h-8 w-8 text-[#3E6328]" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Mis pedidos</h1>
        <p className="text-sm text-slate-500 max-w-md">
          Inicia sesion para ver el historial de tus pedidos, sus documentos tributarios y repetir
          una compra anterior.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal('login')}
          className="flex items-center gap-2 px-5 py-3 bg-[#3E6328] hover:bg-[#2E4C1E] text-white rounded-lg text-sm font-bold uppercase tracking-wide transition-colors cursor-pointer"
        >
          <IconLogin className="h-4 w-4" /> Iniciar sesion
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Mis pedidos</h1>
      <p className="text-sm text-slate-500 mb-6">
        Historial de compras, estado de pago y documentos tributarios.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-9 h-9 border-4 border-[#3E6328] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <IconPackage className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-bold mb-1">Todavia no tienes pedidos</p>
          <p className="text-sm text-slate-400 mb-5">
            Cuando realiza tu primera compra aparecera aqui con su factura.
          </p>
          <Link
            to="/"
            className="inline-block px-5 py-2.5 bg-[#F58220] hover:bg-[#d96f14] text-white rounded-lg text-sm font-bold uppercase transition-colors"
          >
            Ver catalogo
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const ps = paymentStatusInfo(o.paymentStatus);
            const cancelado = o.orderStatus === 'cancelado';
            return (
              <div key={o.orderId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Cabecera */}
                <button
                  type="button"
                  onClick={() => setAbierto(abierto === o.orderId ? null : o.orderId)}
                  className="w-full px-4 py-4 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="font-bold text-slate-900">{o.orderNumber}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(o.createdAt).toLocaleDateString('es-CL', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}{' '}
                      &middot; {o.itemCount} unidad{o.itemCount === 1 ? '' : 'es'}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${ps.color}`}>
                      {ps.label}
                    </span>
                    <span className="font-bold text-[#3E6328] text-sm">{formatCLP(o.total)}</span>
                  </div>
                </button>

                {/* Timeline expandido */}
                {abierto === o.orderId && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-4">
                    {/* Detalle de productos: que compro, no solo cuantas
                        unidades. Sin esto el unico modo de saberlo es
                        repetir el pedido y revisar el carrito. */}
                    {o.items && o.items.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Productos de este pedido
                        </p>
                        <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                          <div className="px-3 py-2 bg-slate-50 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <span className="flex-1">Producto</span>
                            <span className="w-20 text-right">Cantidad</span>
                            <span className="w-24 text-right">Unitario</span>
                            <span className="w-28 text-right">Subtotal</span>
                          </div>
                          {o.items.map((it) => (
                            <div
                              key={it.id}
                              className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-800 truncate">{it.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">{it.format}</p>
                              </div>
                              <span className="w-20 text-right text-slate-600 tabular-nums">
                                {it.quantity} un.
                              </span>
                              <span className="w-24 text-right text-slate-600 tabular-nums">
                                {formatCLP(it.price)}
                              </span>
                              <span className="w-28 text-right font-bold text-slate-900 tabular-nums">
                                {formatCLP(it.subtotal)}
                              </span>
                            </div>
                          ))}
                          <div className="px-3 py-2 bg-slate-50 flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                              Total {o.itemCount} unidad{o.itemCount === 1 ? '' : 'es'}
                            </span>
                            <span className="font-bold text-[#3E6328] tabular-nums">
                              {formatCLP(o.total)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <OrderTimeline order={o} />

                    <div className="flex flex-wrap gap-2 mt-4">
                      {/* El comprobante se imprime desde la app: mientras FACTO no tenga
                          credenciales, dtePdfUrl apunta al sandbox y es un
                          link muerto. La hoja imprimible muestra lo mismo. */}
                      {(o.dteFolio || o.items.length > 0) && (
                        <Link
                          to={`/documento/${o.orderId}`}
                          className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <IconReceipt className="h-3.5 w-3.5" />
                          {o.dteFolio ? `Ver factura ${o.dteFolio}` : 'Ver comprobante'}
                        </Link>
                      )}

                      {!cancelado && (
                        <button
                          type="button"
                          onClick={() => handleReorder(o.orderId)}
                          disabled={reordering === o.orderId}
                          className="flex items-center gap-1.5 px-3 py-2 bg-[#3E6328] hover:bg-[#2E4C1E] disabled:opacity-60 text-white rounded-lg text-[11px] font-bold uppercase transition-colors cursor-pointer"
                        >
                          <IconRefresh
                            className={`h-3.5 w-3.5 ${reordering === o.orderId ? 'animate-spin' : ''}`}
                          />
                          {reordering === o.orderId ? 'Agregando' : 'Repetir pedido'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Linea de tiempo del pedido.
 *
 * Muestra los cuatro estados reales del ciclo: pendiente, pagado,
 * despachado y entregado. Si el pedido esta cancelado, se muestra en
 * su lugar con el motivo claro, en vez de una linea de tiempo que
 * nunca va a completarse.
 */
const OrderTimeline: React.FC<{ order: OrderSummary }> = ({ order }) => {
  const cancelado = order.orderStatus === 'cancelado';
  const rechazado = order.paymentStatus === 'rechazado';

  if (cancelado || rechazado) {
    return (
      <div className="flex items-start gap-3 px-3.5 py-3 bg-red-50 border border-red-200 rounded-lg">
        <IconX className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-red-800">
            {rechazado ? 'El pago fue rechazado' : 'Pedido cancelado'}
          </p>
          <p className="text-[11px] text-red-700 mt-0.5">
            {rechazado
              ? 'No se realizo ningun cargo. Puedes intentar de nuevo con otro metodo de pago.'
              : 'Este pedido fue cancelado. Si realizaste el pago, contactanos para la devolucion.'}
          </p>
        </div>
      </div>
    );
  }

  const pasos = [
    { id: 'pendiente', label: 'Pedido recibido', desc: 'Estamos validando tu compra' },
    { id: 'pagado', label: 'Pago confirmado', desc: 'Recibimos tu pago' },
    { id: 'despachado', label: 'En camino', desc: 'Salio desde la bodega' },
    { id: 'entregado', label: 'Entregado', desc: 'Completado en tu local' }
  ];

  const ordenActual = pasos.findIndex((p) => p.id === order.orderStatus);
  // Si el estado no esta en la lista, se asume al menos el pago hecho.
  const indiceActual = ordenActual >= 0 ? ordenActual : 1;

  return (
    <div className="relative pl-7 space-y-4">
      {/* Linea vertical */}
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />

      {pasos.map((p, i) => {
        const hecho = i <= indiceActual;
        const actual = i === indiceActual;
        return (
          <div key={p.id} className="relative">
            <div
              className={`absolute -left-7 w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                hecho
                  ? 'bg-[#3E6328] border-[#3E6328]'
                  : 'bg-white border-slate-300'
              }`}
            >
              {hecho && <IconCheck className="h-3.5 w-3.5 text-white" />}
            </div>
            <p className={`text-xs font-bold ${hecho ? 'text-slate-800' : 'text-slate-400'}`}>
              {p.label}
              {actual && (
                <span className="ml-2 text-[10px] font-bold text-[#F58220] uppercase">
                  estado actual
                </span>
              )}
            </p>
            <p className={`text-[11px] ${hecho ? 'text-slate-500' : 'text-slate-300'}`}>
              {p.desc}
            </p>
          </div>
        );
      })}
    </div>
  );
};
