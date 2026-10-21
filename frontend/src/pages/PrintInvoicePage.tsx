import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  IconArrowLeft,
  IconPrinter,
  IconAlertTriangle
} from '@tabler/icons-react';

/**
 * Documento tributario imprimible del pedido.
 *
 * Por que existe: hasta ahora el boton de descarga apuntaba a
 * dtePdfUrl, que es una URL del sandbox de FACTO y no resuelve
 * mientras no haya credenciales reales. Un link que lleva a un 404
 * en una pantalla de compra es peor que no tener boton.
 *
 * Que resuelve: renderiza el comprobante con la misma informacion
 * que emitira FACTO y deja que el navegador lo guarde como PDF
 * ("Guardar como PDF" en el dialogo de impresion). No requiere
 * librerias nuevas ni un servidor de PDF.
 *
 * Cuando existan credenciales reales de FACTO, este documento pasa
 * a ser solo el respaldo legible: el PDF oficial lo entrega FACTO
 * con su timbre electronico y su hash.
 */

interface Item {
  id: string;
  sku?: string;
  name: string;
  format: string;
  quantity: number;
  price: number;
  subtotal: number;
  /** Valor unitario sin IVA: es el que va impreso en la factura. */
  precioNeto?: number;
  subtotalNeto?: number;
}

interface Detalle {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  customer: { nombre: string; email: string; telefono?: string };
  /** Precio de vitrina. En Chile YA incluye IVA, no es el neto. */
  subtotal: number;
  descuento: number;
  /** Neto real. neto + iva = total. */
  neto?: number;
  iva: number;
  costoEnvio: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  shippingZone?: string;
  shippingAddress?: string;
  dte: {
    tipoDocumento?: string;
    folio?: string;
    pdfUrl?: string;
    statusLabel?: string;
  };
  items: Item[];
}

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

const METODO: Record<string, string> = {
  webpay: 'Webpay Plus (Transbank)',
  tarjeta: 'Tarjeta de credito / debito',
  transferencia: 'Transferencia bancaria',
  redcompra: 'Redcompra',
  efectivo: 'Efectivo en bodega'
};

export const PrintInvoicePage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    fetch(`/api/orders/${orderId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setD(data.data))
      .catch(() => setError('No se pudo cargar el documento de este pedido.'))
      .finally(() => setCargando(false));
  }, [orderId]);

  if (cargando) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#0B3C73] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !d) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-slate-700 font-bold">{error || 'Documento no encontrado.'}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-[#0B3C73] hover:bg-[#07264A] text-white rounded-lg text-xs font-black uppercase cursor-pointer"
        >
          Volver
        </button>
      </div>
    );
  }

  const esFactura = d.dte.tipoDocumento === 'factura';
  const unidades = d.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:bg-white print:py-0">
      {/* Barra de accion: no se imprime */}
      <div className="max-w-[210mm] mx-auto mb-4 px-4 flex items-center justify-between print:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <IconArrowLeft className="h-3.5 w-3.5" /> Volver
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#F58220] hover:bg-[#d96f14] text-white rounded-lg text-[11px] font-black uppercase shadow-sm transition-colors cursor-pointer"
        >
          <IconPrinter className="h-4 w-4" /> Descargar PDF
        </button>
      </div>

      {/* Hoja del documento */}
      <div className="mx-4 bg-white shadow-lg print:shadow-none print:mx-0 print:w-full">
        <div className="p-8 text-xs font-sans text-slate-900 space-y-4 print:p-0">
          {/* Aviso de emulacion */}
          <div className="flex items-start gap-2 border-2 border-amber-500 bg-amber-50 rounded px-3 py-2">
            <IconAlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-px" />
            <p className="text-[10px] text-amber-900 leading-tight">
              <strong className="font-black uppercase">
                Documento emulado — sin validez tributaria.
              </strong>{' '}
              Réplica de cómo se verá el comprobante una vez que FACTO
              tenga credenciales reales. Este folio no fue autorizado por
              el SII y no puede usarse para declaración ni respaldo contable.
            </p>
          </div>

          {/* Emisor y recuadro rojo chileno */}
          <div className="flex justify-between items-start gap-6">
            <div>
              <h1 className="font-black text-sm uppercase leading-tight">
                Amyb Distribuidora Gastronómica SpA
              </h1>
              <p className="text-[10px] text-slate-600">
                Distribución Mayorista de Insumos Gastronómicos HORECA
              </p>
              <p className="text-[10px] text-slate-500">
                Casa Matriz: Av. Rudecindo Ortega 02150, Temuco
              </p>
              <p className="text-[10px] text-slate-500">
                Fono: +56 9 8765 4321 · Temuco, La Araucanía
              </p>
            </div>

            <div className="border-2 border-red-600 text-center p-2 rounded shrink-0 min-w-[165px] text-red-600">
              <span className="block text-[10px] font-black">R.U.T.: 77.987.654-3</span>
              <span className="block text-[11px] font-black uppercase my-0.5">
                {esFactura ? 'Factura Electrónica' : 'Boleta Electrónica'}
              </span>
              <span className="block text-xs font-black">N° {d.dte.folio || 'S/F'}</span>
              <span className="block text-[9px] font-bold">S.I.I. — TEMUCO</span>
            </div>
          </div>

          {/* Referencia del pedido */}
          <div className="flex justify-between border-b border-slate-300 pb-1 text-[10px]">
            <span>
              <strong>Pedido:</strong> {d.orderNumber}
            </span>
            <span>
              <strong>Fecha emisión:</strong>{' '}
              {new Date(d.createdAt).toLocaleDateString('es-CL')}
            </span>
          </div>

          {/* Receptor */}
          <div className="border border-slate-300 rounded p-3 bg-slate-50 text-[10px] space-y-0.5">
            <p>
              <strong>Señor(es):</strong> {d.customer.nombre}
            </p>
            <p>
              <strong>Email:</strong> {d.customer.email}
              {d.customer.telefono ? ` · ${d.customer.telefono}` : ''}
            </p>
            {d.shippingAddress && (
              <p>
                <strong>Dirección de entrega:</strong> {d.shippingAddress}
              </p>
            )}
            {d.shippingZone && (
              <p>
                <strong>Zona de despacho:</strong> {d.shippingZone}
              </p>
            )}
          </div>

          {/* Detalle de la operacion */}
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-100">
                <th className="text-left px-1.5 py-1.5 uppercase">Código</th>
                <th className="text-left px-1.5 py-1.5 uppercase">Descripción</th>
                <th className="text-right px-1.5 py-1.5 uppercase">Cant.</th>
                <th className="text-right px-1.5 py-1.5 uppercase">P. Unitario</th>
                <th className="text-right px-1.5 py-1.5 uppercase">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.id} className="border-b border-slate-200">
                  <td className="px-1.5 py-1.5 font-mono text-[9px] text-slate-500">
                    {i.sku || '—'}
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span>{i.name}</span>
                    {i.format && (
                      <span className="block text-[9px] text-slate-400">{i.format}</span>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 text-right tabular-nums">{i.quantity}</td>
                  <td className="px-1.5 py-1.5 text-right tabular-nums">
                    {clp(i.precioNeto ?? Math.round(i.price / 1.19))}
                  </td>
                  <td className="px-1.5 py-1.5 text-right tabular-nums font-bold">
                    {clp(i.subtotalNeto ?? Math.round(i.subtotal / 1.19))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totales. Neto + IVA = Total, que es la unica forma de que
              el comprobante sea coherente ante un auditor. */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span>Neto:</span>
                <span className="tabular-nums">{clp(d.neto ?? d.subtotal)}</span>
              </div>
              {d.descuento > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Descuento:</span>
                  <span className="tabular-nums">-{clp(d.descuento)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>IVA (19%):</span>
                <span className="tabular-nums">{clp(d.iva)}</span>
              </div>
              {d.costoEnvio > 0 && (
                <div className="flex justify-between">
                  <span>Despacho:</span>
                  <span className="tabular-nums">{clp(d.costoEnvio)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-xs border-t border-slate-300 pt-1">
                <span>TOTAL:</span>
                <span className="tabular-nums">{clp(d.total)}</span>
              </div>
            </div>
          </div>

          {/* Pago */}
          <div className="border border-slate-300 rounded p-3 text-[10px] space-y-0.5">
            <p>
              <strong>Forma de pago:</strong>{' '}
              {METODO[d.paymentMethod] || d.paymentMethod}
            </p>
            <p>
              <strong>Estado del pago:</strong> {d.paymentStatus}
            </p>
            <p>
              <strong>Estado del pedido:</strong> {d.orderStatus}
            </p>
            {d.dte.statusLabel && (
              <p>
                <strong>Documento tributario:</strong> {d.dte.statusLabel}
              </p>
            )}
          </div>

          {/* Timbre simulado */}
          <div className="border border-slate-300 rounded p-2 text-center bg-slate-50 space-y-0.5">
            <div className="h-9 bg-slate-200 border border-dashed border-slate-400 flex items-center justify-center text-[9px] font-mono text-slate-600">
              ||||||| | ||| |||||| | ||||| | |||| ||| |||| | ||||||| [TED PDF417 SIMULADO FACTO]
            </div>
            <span className="block text-[8px] font-black text-slate-700 uppercase tracking-wider">
              Timbre Electrónico DTE
            </span>
            <span className="block text-[8px] text-slate-500">
              {unidades} unidad{unidades === 1 ? '' : 'es'} · Emitido {new Date(d.createdAt).toLocaleString('es-CL')}
            </span>
            <span className="block text-[8px] text-slate-500">
              Res. N° 80 del SII — Verifique documento en www.sii.cl
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};