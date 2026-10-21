import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { paymentApi, WebpayResult } from '../services/paymentApi';
import {
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconLoader2,
  IconReceipt,
  IconHome,
  IconShoppingBag,
  IconCreditCard
} from '@tabler/icons-react';

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

type PaymentState = 'loading' | 'approved' | 'rejected' | 'aborted' | 'timeout' | 'error';

const STATE_COPY: Record<
  Exclude<PaymentState, 'loading'>,
  { title: string; body: string; color: string; icon: any }
> = {
  approved: {
    title: 'Pago aprobado',
    body: 'Tu pedido esta confirmado y ya estamos preparando el despacho.',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    icon: IconCircleCheck
  },
  rejected: {
    title: 'Pago rechazado',
    body: 'El banco no autorizo la transaccion. No se realizo ningun cargo.',
    color: 'text-red-600 bg-red-50 border-red-200',
    icon: IconCircleX
  },
  aborted: {
    title: 'Pago cancelado',
    body: 'Cancelaste el pago en la pasarela. Tu pedido sigue reservado.',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    icon: IconCircleX
  },
  timeout: {
    title: 'La transaccion expiro',
    body: 'La pasarela de pago alcanzo su tiempo limite. Puedes reintentar desde tus pedidos.',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    icon: IconClock
  },
  error: {
    title: 'No pudimos leer el resultado',
    body: 'Hubo un problema consultando la transaccion. Revisa tus pedidos o contacta a soporte.',
    color: 'text-slate-600 bg-slate-50 border-slate-200',
    icon: IconClock
  }
};

export const PaymentReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<PaymentState>('loading');
  const [result, setResult] = useState<WebpayResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    paymentApi
      .getResult()
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        paymentApi.clearRedirectFlag();

        if (r.success && r.data?.authorized) {
          setState('approved');
        } else if (r.data?.status === 'ABORTED_BY_USER') {
          setState('aborted');
        } else if (r.data?.status === 'TIMED_OUT') {
          setState('timeout');
        } else if (r.success === false && r.message) {
          setState('rejected');
        } else {
          setState('error');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Procesando ---
  if (state === 'loading') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 px-4">
        <IconLoader2 className="h-12 w-12 text-[#3E6328] animate-spin" />
        <h1 className="text-xl font-bold text-slate-900">Confirmando tu pago</h1>
        <p className="text-sm text-slate-500 text-center max-w-sm">
          Estamos verificando la transaccion con Transbank. No cierres esta ventana.
        </p>
      </div>
    );
  }

  const copy = STATE_COPY[state];
  const Icon = copy.icon;

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Estado */}
        <div className={`rounded-2xl border p-8 text-center ${copy.color}`}>
          <Icon className="h-16 w-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{copy.title}</h1>
          <p className="text-sm text-slate-600">{result?.message || copy.body}</p>
        </div>

        {/* Detalle de la transaccion */}
        {result?.data && (result.data.orderNumber || result.data.amount) && (
          <div className="mt-4 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <IconReceipt className="h-4 w-4 text-[#3E6328]" /> Detalle de la transaccion
              </h2>
            </div>

            <dl className="divide-y divide-slate-100">
              {result.data.orderNumber && (
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-xs text-slate-500 font-medium">Numero de pedido</dt>
                  <dd className="text-sm font-bold text-slate-900">
                    {result.data.orderNumber}
                  </dd>
                </div>
              )}

              {result.data.amount && (
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-xs text-slate-500 font-medium">Monto</dt>
                  <dd className="text-sm font-bold text-[#3E6328]">
                    {formatCLP(result.data.amount)}
                  </dd>
                </div>
              )}

              {result.data.cardNumber && (
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-xs text-slate-500 font-medium">Tarjeta</dt>
                  <dd className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <IconCreditCard className="h-3.5 w-3.5 text-slate-400" />
                    {result.data.cardNumber}
                  </dd>
                </div>
              )}

              {result.data.paymentTypeCode && (
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-xs text-slate-500 font-medium">Tipo de pago</dt>
                  <dd className="text-sm font-bold text-slate-800">
                    {result.data.paymentTypeCode === 'CD' ? 'Credito' : 'Debito'}
                    {result.data.installments ? ` - ${result.data.installments} cuotas` : ''}
                  </dd>
                </div>
              )}

              {result.data.authorizationCode && (
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-xs text-slate-500 font-medium">Codigo de autorizacion</dt>
                  <dd className="text-sm font-mono font-bold text-slate-800">
                    {result.data.authorizationCode}
                  </dd>
                </div>
              )}

              {result.data.alreadyProcessed && (
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-xs text-slate-500 font-medium">Nota</dt>
                  <dd className="text-xs text-slate-600 text-right">
                    Esta transaccion ya se habia confirmado antes
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Como sigue */}
        {state === 'approved' && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-2xl p-5">
            <h3 className="text-xs font-bold text-[#3E6328] uppercase tracking-wider mb-2">
              Que sigue ahora
            </h3>
            <ol className="text-xs text-slate-700 space-y-1.5 list-decimal list-inside">
              <li>Recibiras la boleta o factura electronica por email.</li>
              <li>Confirmamos stock y preparamos el despacho.</li>
              <li>Entregamos en 24 horas habiles en Temuco y PLC.</li>
            </ol>
          </div>
        )}

        {/* Acciones */}
        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          {state === 'approved' ? (
            <>
              <Link
                to="/mis-pedidos"
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#3E6328] hover:bg-[#2E4C1E] text-white rounded-xl text-sm font-bold uppercase tracking-wide transition-colors"
              >
                <IconReceipt className="h-4 w-4" /> Ver mis pedidos
              </Link>
              <Link
                to="/"
                className="flex-1 flex items-center justify-center gap-2 py-3 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-bold uppercase tracking-wide transition-colors"
              >
                <IconShoppingBag className="h-4 w-4" /> Seguir comprando
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate('/mis-pedidos')}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#3E6328] hover:bg-[#2E4C1E] text-white rounded-xl text-sm font-bold uppercase tracking-wide transition-colors cursor-pointer"
              >
                <IconReceipt className="h-4 w-4" /> Intentar de nuevo
              </button>
              <Link
                to="/"
                className="flex-1 flex items-center justify-center gap-2 py-3 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-bold uppercase tracking-wide transition-colors"
              >
                <IconHome className="h-4 w-4" /> Volver al inicio
              </Link>
            </>
          )}
        </div>

        <p className="mt-4 text-[10px] text-slate-400 text-center leading-relaxed">
          Transbank procesa el pago. Amyb nunca recibe ni almacena los datos de tu tarjeta.
        </p>
      </div>
    </div>
  );
};
