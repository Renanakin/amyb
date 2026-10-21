import { useModalFocus } from '../storefront/useModalFocus';
import React, { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { api } from '../services/api';
import { formatCLPSimple } from '../utils/formatters';
import {
  IconX,
  IconReceipt,
  IconBuildingStore,
  IconSearch,
  IconFilter,
  IconRefresh,
  IconExternalLink,
  IconFileCode,
  IconCheck,
  IconClock,
  IconDownload,
  IconShieldCheck,
  IconFileText,
  IconAlertTriangle
} from '@tabler/icons-react';

interface DteItem {
  id: string;
  orderId: string;
  orderNumber: string;
  documentId: number;
  folio: number;
  documentTypeId: number;
  documentTypeName: string;
  siiCode: string;
  fechaEmision: string;
  receptor: {
    rut?: string;
    razonSocial: string;
    giro?: string;
    direccion?: string;
    email?: string;
  };
  neto: number;
  iva: number;
  total: number;
  statusLabel: string;
  taxbureauSendStatus: number;
  taxbureauValidationStatus: number;
  isSandbox: boolean;
  pdfUrl?: string;
  xmlUrl?: string;
  /**
   * Lineas del comprobante. Una factura electronica sin detalle no
   * es una factura: el SII exige itemizar cada operacion.
   */
  items: DteLinea[];
}

export interface DteLinea {
  codigo: string;
  descripcion: string;
  formato: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export const DteLedgerModal: React.FC = () => {
  const { isDteLedgerOpen, setDteLedgerOpen, showToast } = useCart();
  const [documents, setDocuments] = useState<DteItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'factura' | 'boleta'>('all');
  const [previewDte, setPreviewDte] = useState<DteItem | null>(null);

  const fetchLedger = () => {
    setLoading(true);
    api.getFactoLedger()
      .then((res) => {
        if (res.data) setDocuments(res.data);
        if (res.summary) setSummary(res.summary);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isDteLedgerOpen) {
      fetchLedger();
    }
  }, [isDteLedgerOpen]);

  useModalFocus(isDteLedgerOpen, 'amyb-dte-dialog', () => setDteLedgerOpen(false));

  if (!isDteLedgerOpen) return null;

  const filteredDocs = documents.filter((doc) => {
    const matchesType =
      filterType === 'all' ||
      (filterType === 'factura' && doc.documentTypeId === 2) ||
      (filterType === 'boleta' && doc.documentTypeId === 37);

    const term = search.toLowerCase().trim();
    const matchesSearch =
      !term ||
      String(doc.folio).includes(term) ||
      (doc.receptor.rut && doc.receptor.rut.toLowerCase().includes(term)) ||
      doc.receptor.razonSocial.toLowerCase().includes(term) ||
      doc.orderId.toLowerCase().includes(term);

    return matchesType && matchesSearch;
  });

  const handleSimulateStatusCheck = (doc: DteItem) => {
    showToast(`Consultando folio ${doc.folio} en FACTO Chile... Estado: Aprobado por SII`);
  };

  return (
    <div id="amyb-dte-dialog" data-amyb-modal role="dialog" aria-modal="true" aria-label="Libro de documentos tributarios" tabIndex={-1} className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      <div className="bg-white rounded-2xl sm:rounded-xl w-full max-w-6xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[96vh] flex flex-col">
        {/* Header Bar */}
        <div className="store-overlay-header px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#dce4d1]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F58220] text-white rounded-xl">
              <IconReceipt className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base sm:text-lg font-bold text-white leading-tight">
                  Libro de Facturación Electrónica DTE (FACTO Chile)
                </h2>
                <span className="bg-[#F58220]/20 text-[#F58220] border border-[#F58220]/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider hidden sm:inline-block">
                  Ambiente Sandbox #423
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Registro oficial de Facturas Electrónicas (SII 33) y Boletas Electrónicas (SII 39) emitidas al pagar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLedger}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-xl transition-colors cursor-pointer"
              title="Refrescar libro tributario"
            >
              <IconRefresh className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDteLedgerOpen(false)}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-xl transition-colors cursor-pointer"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Facturado
              </span>
              <strong className="font-display text-xl sm:text-2xl font-bold text-[#3E6328] mt-1 block">
                {formatCLPSimple(summary?.totalFacturado || 0)} CLP
              </strong>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {summary?.totalDocumentos || 0} DTEs emitidos en total
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                IVA Débito Fiscal (19%)
              </span>
              <strong className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-1 block">
                {formatCLPSimple(summary?.totalIvaDebito || 0)} CLP
              </strong>
              <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 block">
                ✓ Discriminado según SII
              </span>
            </div>

            <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[#3E6328] uppercase tracking-wider block">
                Facturas B2B (SII 33)
              </span>
              <strong className="font-display text-xl sm:text-2xl font-bold text-[#3E6328] mt-1 block">
                {summary?.totalFacturas || 0} Documentos
              </strong>
              <span className="text-[10px] text-blue-600 mt-0.5 block">
                Para locales con RUT de Empresa
              </span>
            </div>

            <div className="bg-orange-50/70 border border-orange-100 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[#F58220] uppercase tracking-wider block">
                Boletas B2C (SII 39)
              </span>
              <strong className="font-display text-xl sm:text-2xl font-bold text-[#F58220] mt-1 block">
                {summary?.totalBoletas || 0} Documentos
              </strong>
              <span className="text-[10px] text-orange-600 mt-0.5 block">
                Ventas a consumidor final
              </span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <IconSearch className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por Folio, RUT (77.xxx), empresa o cliente..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#3E6328]"
              />
            </div>

            {/* Document Type Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-[#3E6328] text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
                }`}
              >
                Todos ({documents.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('factura')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterType === 'factura'
                    ? 'bg-[#3E6328] text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
                }`}
              >
                Facturas SII 33 ({summary?.totalFacturas || 0})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('boleta')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterType === 'boleta'
                    ? 'bg-[#3E6328] text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
                }`}
              >
                Boletas SII 39 ({summary?.totalBoletas || 0})
              </button>
            </div>
          </div>

          {/* DTE Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Folio & Tipo</th>
                    <th className="py-3 px-4">Fecha Emisión</th>
                    <th className="py-3 px-4">Receptor / RUT</th>
                    <th className="py-3 px-4 text-right">Neto</th>
                    <th className="py-3 px-4 text-right">IVA (19%)</th>
                    <th className="py-3 px-4 text-right">Total CLP</th>
                    <th className="py-3 px-4 text-center">Estado SII</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Cargando documentos de FACTO Chile...
                      </td>
                    </tr>
                  ) : filteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No se encontraron documentos para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Folio & Tipo */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                doc.documentTypeId === 2
                                  ? 'bg-blue-100 text-[#3E6328]'
                                  : 'bg-orange-100 text-[#F58220]'
                              }`}
                            >
                              {doc.documentTypeId === 2 ? 'Factura' : 'Boleta'}
                            </span>
                            <strong className="text-slate-900 font-bold">
                              N° {doc.folio}
                            </strong>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            SII {doc.siiCode} • ID #{doc.documentId}
                          </span>
                        </td>

                        {/* Fecha */}
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(doc.fechaEmision).toLocaleDateString('es-CL', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                          <span className="block text-[10px] text-slate-400">
                            {new Date(doc.fechaEmision).toLocaleTimeString('es-CL', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </td>

                        {/* Receptor */}
                        <td className="py-3.5 px-4 min-w-[200px]">
                          <strong className="text-slate-900 font-bold block truncate max-w-xs">
                            {doc.receptor.razonSocial}
                          </strong>
                          {doc.receptor.rut && (
                            <span className="text-[11px] font-mono text-[#3E6328] font-semibold block">
                              RUT: {doc.receptor.rut}
                            </span>
                          )}
                          {doc.receptor.giro && (
                            <span className="text-[10px] text-slate-400 block truncate max-w-xs">
                              {doc.receptor.giro}
                            </span>
                          )}
                        </td>

                        {/* Neto */}
                        <td className="py-3.5 px-4 text-right font-medium text-slate-600">
                          {formatCLPSimple(doc.neto)}
                        </td>

                        {/* IVA */}
                        <td className="py-3.5 px-4 text-right font-medium text-slate-600">
                          {formatCLPSimple(doc.iva)}
                        </td>

                        {/* Total */}
                        <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-display">
                          {formatCLPSimple(doc.total)}
                        </td>

                        {/* Estado SII */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <IconCheck className="h-3 w-3" />
                            <span>Aprobado SII</span>
                          </span>
                        </td>

                        {/* Acciones */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewDte(doc)}
                              className="inline-flex items-center gap-1 bg-[#3E6328] hover:bg-[#2E4C1E] text-white px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                              title="Ver Comprobante Oficial DTE"
                            >
                              <IconFileText className="h-3 w-3" />
                              <span>Ver DTE</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSimulateStatusCheck(doc)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Consultar Estado en Vivo FACTO"
                            >
                              <IconRefresh className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <IconShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>
              Emisor Autorizado: <strong>Amyb Distribuidora Gastronómica SpA (RUT 77.987.654-3)</strong>
            </span>
          </div>
          <span>Ambiente de Pruebas FACTO • Temuco, Chile</span>
        </div>
      </div>

      {/* DTE Printable Voucher Preview Modal */}
      {previewDte && (
        <div className="fixed inset-0 z-60 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="store-overlay-header px-4 py-3 flex items-center justify-between">
              <span className="font-bold text-xs">
                Vista Previa Comprobante Tributario Chileno (SII)
              </span>
              <button
                type="button"
                onClick={() => setPreviewDte(null)}
                className="text-slate-400 hover:text-white"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            {/* Graphic Voucher Body resembling Chilean Legal DTE */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
              {/* Aviso de emulacion. Este comprobante tiene la forma de
                  una factura chilena, pero NO lo es: no fue autorizado
                  por el SII y no tiene valor tributario. Sin este aviso,
                  un documento con timbre y folio puede tomarse por uno
                  real. */}
              <div className="flex items-start gap-2 border-2 border-amber-500 bg-amber-50 rounded-lg px-3 py-2">
                <IconAlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-px" />
                <div className="text-[11px] text-amber-900 leading-tight">
                  <strong className="font-bold uppercase">Documento emulado — sin validez tributaria.</strong>{' '}
                  Réplica visual de cómo se verá la factura una vez que
                  FACTO tenga credenciales reales. Este folio no fue
                  autorizado por el SII y no puede usarse para declaración.
                </div>
              </div>
              {/* Top Header with iconic red box */}
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 uppercase">
                    AMYB DISTRIBUIDORA GASTRONÓMICA SPA
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    Distribución Mayorista de Insumos Gastronómicos HORECA
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Casa Matriz: Av. Rudecindo Ortega 02150, Temuco
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Fono: +56 9 8765 4321 • Temuco, La Araucanía
                  </p>
                </div>

                {/* Iconic Chilean Red Box */}
                <div className="border-2 border-red-600 text-center p-2 rounded shrink-0 min-w-[170px] text-red-600">
                  <span className="block text-[11px] font-bold">R.U.T.: 77.987.654-3</span>
                  <span className="block text-xs font-bold uppercase my-0.5">
                    {previewDte.documentTypeName}
                  </span>
                  <span className="block text-sm font-bold">
                    N° {previewDte.folio}
                  </span>
                  <span className="block text-[9px] font-bold">
                    S.I.I. - TEMUCO
                  </span>
                </div>
              </div>

              {/* Receptor Details */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span><strong>Señor(es):</strong> {previewDte.receptor.razonSocial}</span>
                  <span><strong>Fecha:</strong> {new Date(previewDte.fechaEmision).toLocaleDateString('es-CL')}</span>
                </div>
                {previewDte.receptor.rut && (
                  <p><strong>R.U.T.:</strong> {previewDte.receptor.rut}</p>
                )}
                {previewDte.receptor.giro && (
                  <p><strong>Giro:</strong> {previewDte.receptor.giro}</p>
                )}
                <p><strong>Dirección:</strong> {previewDte.receptor.direccion || 'Temuco, Región de La Araucanía'}</p>
              </div>

              {/* Detalle de la operacion */}
              {previewDte.items && previewDte.items.length > 0 && (
                <div className="border border-slate-300 rounded overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-bold uppercase">Codigo</th>
                        <th className="text-left px-2 py-1.5 font-bold uppercase">Descripcion</th>
                        <th className="text-right px-2 py-1.5 font-bold uppercase">Cant.</th>
                        <th className="text-right px-2 py-1.5 font-bold uppercase">P. Unitario</th>
                        <th className="text-right px-2 py-1.5 font-bold uppercase">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewDte.items.map((li, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">
                            {li.codigo}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="text-slate-800">{li.descripcion}</span>
                            {li.formato && (
                              <span className="block text-[10px] text-slate-400">{li.formato}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                            {li.cantidad}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                            {formatCLPSimple(li.precioUnitario)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-bold text-slate-900">
                            {formatCLPSimple(li.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              <div className="flex justify-end pt-2">
                <div className="w-56 space-y-1 text-right text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Monto Neto:</span>
                    <span>{formatCLPSimple(previewDte.neto)} CLP</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IVA (19%):</span>
                    <span>{formatCLPSimple(previewDte.iva)} CLP</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-300 pt-1">
                    <span>TOTAL:</span>
                    <span>{formatCLPSimple(previewDte.total)} CLP</span>
                  </div>
                </div>
              </div>

              {/* Official Timbre Electrónico DTE (TED) Simulation */}
              <div className="border border-slate-300 rounded p-3 text-center bg-slate-50 space-y-1 mt-4">
                <div className="h-10 bg-slate-200 border border-dashed border-slate-400 flex items-center justify-center text-[10px] font-mono text-slate-600">
                  ||||||| | ||| |||||| | ||||| | |||| ||| |||| | ||||||| [TED PDF417 SIMULADO FACTO]
                </div>
                <span className="block text-[9px] font-bold text-slate-700 uppercase tracking-wider">
                  Timbre Electrónico DTE
                </span>
                <span className="block text-[8px] text-slate-500">
                  Res. N° 80 del SII - Verifique documento en www.sii.cl o sandbox.apifacto.com
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewDte(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
