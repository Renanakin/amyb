import { useModalFocus } from '../storefront/useModalFocus';
import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useCart } from '../context/CartContext';
import { formatCLPSimple } from '../utils/formatters';
import {
  IconCheck,
  IconReceipt,
  IconTruckDelivery,
  IconBrandWhatsapp,
  IconX,
  IconClock
} from '@tabler/icons-react';

export const OrderConfirmationModal: React.FC = () => {
  const { completedOrder, setCompletedOrder } = useCart();

  useEffect(() => {
    if (completedOrder) {
      // Trigger festive confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [completedOrder]);

  useModalFocus(!!completedOrder, 'amyb-confirmation-dialog', () => setCompletedOrder(null));

  if (!completedOrder) return null;

  const whatsappMessage = encodeURIComponent(
    `Hola Amyb Distribuidora, acabo de generar el pedido ${completedOrder.orderId} por un total de ${formatCLPSimple(completedOrder.total)}. Deseo coordinar el despacho a ${completedOrder.shippingAddress}.`
  );

  return (
    <div id="amyb-confirmation-dialog" data-amyb-modal role="dialog" aria-modal="true" aria-label="Confirmación del pedido" tabIndex={-1} className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-scaleUp">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-[#2E4C1E] to-[#3E6328] text-white p-6 text-center relative">
          <button
            type="button"
            onClick={() => setCompletedOrder(null)}
            className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <IconX className="h-5 w-5" />
          </button>

          <div className="w-16 h-16 bg-emerald-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg ring-4 ring-white/20">
            <IconCheck className="h-9 w-9 stroke-[3]" />
          </div>

          <span className="text-xs font-bold text-[#F58220] uppercase tracking-wider block">
            ¡Pedido Confirmado con Éxito!
          </span>
          <h3 className="font-display text-2xl font-bold text-white mt-1">
            {completedOrder.orderId}
          </h3>
          <p className="text-xs text-blue-100 mt-1">
            Hemos recibido tu orden y ya está en preparación en nuestra Bodega Central de Temuco.
          </p>
        </div>

        {/* Order Details Body */}
        <div className="p-6 space-y-5 text-xs text-slate-700">
          {/* Status Ribbon */}
          <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconTruckDelivery className="h-5 w-5 text-[#3E6328]" />
              <div>
                <strong className="block text-slate-900 font-bold">Despacho en 24 Horas</strong>
                <span className="text-slate-500 text-[11px]">{completedOrder.shippingZone}</span>
              </div>
            </div>
            <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
              Confirmado
            </span>
          </div>

          {/* DTE Information con Integración FACTO Chile */}
          <div className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50">
            <div className="flex items-center justify-between font-bold text-slate-900 mb-1">
              <span className="flex items-center gap-1.5">
                <IconReceipt className="h-4 w-4 text-[#F58220]" />
                {completedOrder.factoDte ? (
                  <span>
                    {completedOrder.factoDte.documentTypeName} <strong>N° {completedOrder.factoDte.folio}</strong> (SII {completedOrder.factoDte.siiCode})
                  </span>
                ) : (
                  <span>Comprobante Tributario ({completedOrder.dte.tipoDocumento === 'factura' ? 'Factura Electrónica' : 'Boleta'})</span>
                )}
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                {completedOrder.factoDte?.statusLabel || 'SII Integrado'}
              </span>
            </div>

            {completedOrder.dte.tipoDocumento === 'factura' ? (
              <div className="text-[11px] text-slate-600 space-y-0.5 bg-white p-2.5 rounded-lg border border-slate-200">
                <p><strong>RUT Empresa Receptor:</strong> {completedOrder.dte.rutEmpresa}</p>
                <p><strong>Razón Social:</strong> {completedOrder.dte.razonSocial}</p>
                <p><strong>Giro Comercial:</strong> {completedOrder.dte.giroComercial}</p>
                <p><strong>Dirección Tributaria:</strong> {completedOrder.dte.direccionTributaria}</p>
                {completedOrder.factoDte?.pdfUrl && (
                  <div className="pt-1.5 mt-1.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">DTE FACTO ID: #{completedOrder.factoDte.documentId}</span>
                    <a
                      href={completedOrder.factoDte.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-[#3E6328] hover:underline"
                    >
                      Ver Comprobante DTE (PDF) ↗
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                <p>
                  Boleta electrónica emitida exitosamente para <strong>{completedOrder.customer.nombre}</strong>.
                </p>
                <p className="text-slate-500 text-[10px] mt-0.5">
                  Copia tributaria digital enviada al correo: <strong>{completedOrder.customer.email}</strong>
                </p>
              </div>
            )}
          </div>

          {/* Purchased Items List */}
          <div>
            <h4 className="font-bold text-slate-900 mb-2">Detalle de Insumos:</h4>
            <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl px-3 py-1 bg-white">
              {completedOrder.items.map((item, idx) => (
                <div key={idx} className="py-2 flex justify-between items-center text-[11px]">
                  <div>
                    <span className="font-bold text-slate-800 block">{item.name}</span>
                    <span className="text-slate-500">{item.quantity} x {formatCLPSimple(item.price)} ({item.format})</span>
                  </div>
                  <strong className="text-slate-900">{formatCLPSimple(item.subtotal)}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Summary */}
          <div className="space-y-1 pt-2 border-t border-slate-200 text-[11px]">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-semibold">{formatCLPSimple(completedOrder.subtotal)}</span>
            </div>
            {completedOrder.descuento > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Descuento aplicado:</span>
                <span>-{formatCLPSimple(completedOrder.descuento)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-500">
              <span>Neto:</span>
              <span>{formatCLPSimple(completedOrder.subtotal - completedOrder.iva)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>IVA (19% DTE):</span>
              <span>{formatCLPSimple(completedOrder.iva)}</span>
            </div>
            <div className="flex justify-between">
              <span>Despacho:</span>
              <span>{completedOrder.costoEnvio === 0 ? 'GRATIS' : formatCLPSimple(completedOrder.costoEnvio)}</span>
            </div>
            <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-300">
              <span>Total Pagado:</span>
              <span className="text-[#3E6328] font-display text-base">
                {formatCLPSimple(completedOrder.total)} CLP
              </span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="pt-2 space-y-2">
            <a
              href={`https://wa.me/56987654321?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <IconBrandWhatsapp className="h-5 w-5" />
              <span>Notificar Despacho por WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => setCompletedOrder(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl transition-colors cursor-pointer"
            >
              Volver a la Tienda
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
