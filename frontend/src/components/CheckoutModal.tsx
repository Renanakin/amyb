import React, { useState, useCallback } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatCLPSimple, formatChileanRut, validateChileanRut } from '../utils/formatters';
import { precioUnitario, precioConNivelCliente } from '../utils/precios';
import { api } from '../services/api';
import { paymentApi } from '../services/paymentApi';
import {
  IconX,
  IconReceipt,
  IconTruck,
  IconCreditCard,
  IconBuildingStore,
  IconBuildingBank,
  IconCash,
  IconCheck,
  IconAlertCircle,
  IconShieldCheck
} from '@tabler/icons-react';

export const CheckoutModal: React.FC<{ inline?: boolean; onDismiss?: () => void }> = ({ inline = false, onDismiss }) => {
  const { user } = useAuth();
  const {
    isCheckoutOpen,
    setCheckoutOpen,
    cartItems,
    subtotal,
    neto,
    iva,
    shippingCost,
    total,
    discountAmount,
    couponCode,
    shippingZones,
    selectedZone,
    setSelectedZone,
    setCompletedOrder,
    clearCart,
    showToast,
    // Nivel de precio del cliente: define el descuento que ve en toda
    // la tienda. El cobro real lo vuelve a calcular el servidor.
    nivelCliente
  } = useCart();

  // Stepper state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Form states.
  // Se inicializan vacios y se rellenan desde la cuenta del cliente si
  // esta conectado. El prototipo traia datos de ejemplo hardcodeados,
  // asi que un cliente real vecia el nombre de otra persona.
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');

  // DTE states
  const [tipoDocumento, setTipoDocumento] = useState<'boleta' | 'factura'>('factura');
  const [rutEmpresa, setRutEmpresa] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [giroComercial, setGiroComercial] = useState('');
  const [direccionTributaria, setDireccionTributaria] = useState('');
  const [comunaTributaria, setComunaTributaria] = useState('');

  // Delivery states
  const [direccionEntrega, setDireccionEntrega] = useState('');
  const [instruccionesEntrega, setInstruccionesEntrega] = useState('');

  // Payment states
  const [paymentMethod, setPaymentMethod] = useState<'webpay' | 'transferencia' | 'contra_entrega'>('webpay');

  // Loading & error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Rellena el checkout con los datos de la cuenta del cliente.
   * Es la razon de tener "Mi cuenta": un comprador HORECA no debe
   * escribir su RUT y razon social en cada pedido.
   */
  React.useEffect(() => {
    if (!isCheckoutOpen || !user) return;

    setNombre(user.nombre || '');
    setEmail(user.email || '');
    setTelefono(user.telefono || '');

    // El RUT guardado puede venir sin formato ("765432103") o con
    // ("76.543.210-3"). Se pasa siempre por el formateador: si no, el
    // campo aparece con el numero pelado y el cliente ve un dato
    // invalido antes de confirmar.
    if (user.rutEmpresa) setRutEmpresa(formatChileanRut(user.rutEmpresa));
    if (user.razonSocial) setRazonSocial(user.razonSocial);
    if (user.giroComercial) setGiroComercial(user.giroComercial);
    if (user.direccionTributaria) setDireccionTributaria(user.direccionTributaria);
    if (user.comunaTributaria) setComunaTributaria(user.comunaTributaria);

    // La direccion de entrega se toma de la direccion tributaria si existe
    if (user.direccionTributaria && !direccionEntrega) {
      setDireccionEntrega(user.direccionTributaria);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckoutOpen, user]);

  // --- Estado de cobertura de la direccion de entrega ---
  //
  // Se consulta al backend, que es quien manda. Si la direccion cae
  // fuera del radio, la venta queda bloqueada y el backend la rechaza
  // aunque el navegador intente enviarla igual.
  const [entrega, setEntrega] = useState<any>(null);
  const [verificando, setVerificando] = useState(false);

  const verificarEntrega = useCallback(
    async (direccion: string) => {
      if (direccion.trim().length < 10) {
        setEntrega(null);
        return;
      }
      setVerificando(true);
      try {
        const res = await fetch('/api/orders/calculate', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cartItems.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
            zoneId: selectedZone?.id || 'zone-temuco-centro',
            direccionEntrega: direccion
          })
        });
        const data = await res.json();
        if (data.success && data.data?.entrega) {
          setEntrega(data.data.entrega);
        }
      } catch {
        // Sin verificacion no se bloquea: se avisa al confirmar
        setEntrega(null);
      } finally {
        setVerificando(false);
      }
    },
    [cartItems, selectedZone]
  );

  // Verifica de nuevo cuando cambia la direccion, con retardo para no
  // consultar en cada tecla.
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (currentStep === 2 && direccionEntrega) {
        verificarEntrega(direccionEntrega);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [direccionEntrega, currentStep, verificarEntrega]);

  if (!isCheckoutOpen) return null;

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setRutEmpresa(formatChileanRut(raw));
  };

  const handleZoneSelect = (zoneId: string) => {
    const z = shippingZones.find((item) => item.id === zoneId);
    if (z) {
      setSelectedZone(z);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate DTE if invoice
    if (tipoDocumento === 'factura') {
      if (!validateChileanRut(rutEmpresa)) {
        setErrorMessage('El RUT de la Empresa ingresado no es válido para facturación del SII.');
        setCurrentStep(1);
        return;
      }
      if (!razonSocial.trim()) {
        setErrorMessage('La Razón Social es obligatoria para emitir Factura Electrónica.');
        setCurrentStep(1);
        return;
      }
    }

    if (!direccionEntrega.trim()) {
      setErrorMessage('La dirección de entrega en Temuco/PLC es obligatoria.');
      setCurrentStep(2);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        customer: { nombre, email, telefono },
        dte: {
          tipoDocumento,
          rutEmpresa: tipoDocumento === 'factura' ? rutEmpresa : undefined,
          razonSocial: tipoDocumento === 'factura' ? razonSocial : undefined,
          giroComercial: tipoDocumento === 'factura' ? giroComercial : undefined,
          direccionTributaria: tipoDocumento === 'factura' ? direccionTributaria : undefined,
          comunaTributaria: tipoDocumento === 'factura' ? comunaTributaria : undefined
        },
        shipping: {
          zoneId: selectedZone.id,
          direccionEntrega: `${direccionEntrega} (${instruccionesEntrega})`
        },
        paymentMethod,
        items: cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity
        })),
        couponCode: couponCode || undefined
      };

      const result = await api.createOrder(payload);

      if (!result.success || !result.data) {
        // Un rechazo por cobertura, minimo mayorista o stock devuelve al
        // cliente al paso donde puede corregirlo, no al de pago que esta
        // tres pantallas mas lejos del problema.
        const code = (result as any).code;
        if (code === 'OUT_OF_DELIVERY_RANGE') {
          setCurrentStep(2);
        } else if (code === 'BELOW_MINIMUM' || code === 'INSUFFICIENT_STOCK') {
          setCurrentStep(1);
        }
        setErrorMessage(
          result.message || 'No pudimos registrar tu pedido. Intenta nuevamente.'
        );
        return;
      }

      // --- Webpay: el pedido se creo en estado 'pendiente' y ahora se
      // abre la pasarela. El total real lo confirmara Transbank. ---
      if (paymentMethod === 'webpay') {
        setIsSubmitting(true);
        const init = await paymentApi.initWebpay(result.data.orderId);

        if (!init.success || !init.data) {
          setErrorMessage(
            init.message || 'No se pudo abrir la pasarela de pago de Transbank.'
          );
          return;
        }

        setCompletedOrder(result.data);
        // Se vacia el carrito recien aqui: si la pasarela falla, el pedido
        // sigue vivo y el cliente no pierde sus productos.
        clearCart();
        showToast('Redirigiendo a Transbank...');
        paymentApi.redirectToWebpay(init.data.url, init.data.token);
        return;
      }

      // --- Transferencia o contra entrega ---
      setCompletedOrder(result.data);
      clearCart();
      setCheckoutOpen(false);
      showToast('¡Pedido completado con éxito!');
    } catch (err: any) {
      // Error de red: el backend no respondio. NO se creo ningun pedido,
      // asi que se puede reintentar sin riesgo de cobrar dos veces.
      console.error('[CHECKOUT] Error de red al crear el pedido:', err);
      setErrorMessage(
        'No pudimos conectarnos con el servidor. Revisa tu conexión e intenta nuevamente. ' +
          'No se creó ningún pedido ni se realizó ningún cargo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={inline ? 'checkout-inline feature-surfaces' : 'fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 flex items-center justify-center p-2 sm:p-4 md:p-6'}>
      <div className={inline ? 'checkout-surface' : 'bg-white rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col'}>
        {/* Top Bar with Brand & Close Button */}
        <div className="store-overlay-header px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src="/logo-amyb.png" alt="Amyb" className="h-7 sm:h-8 w-auto" />
            <div className="border-l border-slate-600 pl-2 sm:pl-3">
              <span className="text-[11px] sm:text-xs font-bold text-[#F58220] block uppercase tracking-wider">
                Datos, entrega y pago
              </span>
              <span className="text-[10px] sm:text-[11px] text-slate-300">
                Completa tu compra en Amyb
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setCheckoutOpen(false); onDismiss?.(); }}
            aria-label="Cerrar compra y volver al catálogo"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper Progress Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between text-xs gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-1.5 sm:gap-2 font-bold cursor-pointer transition-colors ${
                currentStep === 1 ? 'text-[#3E6328]' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs shrink-0 ${
                currentStep === 1 ? 'bg-[#3E6328] text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                1
              </span>
              <span className="text-[11px] sm:text-xs"><span className="hidden md:inline">Datos & </span>Facturación</span>
            </button>

            <span className="text-slate-300 font-bold text-[10px] sm:text-xs">──</span>

            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className={`flex items-center gap-1.5 sm:gap-2 font-bold cursor-pointer transition-colors ${
                currentStep === 2 ? 'text-[#3E6328]' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs shrink-0 ${
                currentStep === 2 ? 'bg-[#3E6328] text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                2
              </span>
              <span className="text-[11px] sm:text-xs">Despacho</span>
            </button>

            <span className="text-slate-300 font-bold text-[10px] sm:text-xs">──</span>

            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className={`flex items-center gap-1.5 sm:gap-2 font-bold cursor-pointer transition-colors ${
                currentStep === 3 ? 'text-[#3E6328]' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs shrink-0 ${
                currentStep === 3 ? 'bg-[#3E6328] text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                3
              </span>
              <span className="text-[11px] sm:text-xs">Pago</span>
            </button>
          </div>
        </div>

        {/* Content Grid: Form (7 cols) + Sticky Summary (5 cols) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
          {/* Left Form Area */}
          <div className="lg:col-span-7 space-y-6">
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                <IconAlertCircle className="h-5 w-5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* STEP 1: Datos de Contacto y Facturación SII */}
            {currentStep === 1 && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                    <IconReceipt className="h-5 w-5 text-[#3E6328]" />
                    Paso 1: Información de Contacto y Documento Tributario
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Selecciona Boleta para consumidor final o Factura con RUT de Empresa para deducir IVA.
                  </p>
                </div>

                {/* Contact Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nombre Completo / Encargado</label>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#3E6328]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Teléfono / WhatsApp</label>
                    <input
                      type="text"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#3E6328]"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico (para DTE)</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#3E6328]"
                      required
                    />
                  </div>
                </div>

                {/* DTE Selector (Boleta vs Factura) */}
                <div className="pt-3 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Tipo de Documento Tributario (DTE):
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setTipoDocumento('boleta')}
                      aria-pressed={tipoDocumento === 'boleta'}
                      className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                        tipoDocumento === 'boleta'
                          ? 'border-[#3E6328] bg-blue-50/50 ring-2 ring-[#3E6328]/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                        tipoDocumento === 'boleta' ? 'border-[#3E6328] bg-[#3E6328]' : 'border-slate-400'
                      }`}>
                        {tipoDocumento === 'boleta' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <div>
                        <strong className="block text-xs text-slate-900">Boleta Electrónica</strong>
                        <span className="text-[11px] text-slate-500">Para compras familiares o consumidor final</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTipoDocumento('factura')}
                      aria-pressed={tipoDocumento === 'factura'}
                      className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                        tipoDocumento === 'factura'
                          ? 'border-[#F58220] bg-orange-50/40 ring-2 ring-[#F58220]/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                        tipoDocumento === 'factura' ? 'border-[#F58220] bg-[#F58220]' : 'border-slate-400'
                      }`}>
                        {tipoDocumento === 'factura' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <strong className="block text-xs text-slate-900">Factura Electrónica</strong>
                          <span className="bg-[#F58220] text-white text-[9px] font-bold px-1.5 py-0.2 rounded">HORECA</span>
                        </div>
                        <span className="text-[11px] text-slate-500">Para locales comerciales y empresas (RUT SII)</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Conditional Factura Fields */}
                {tipoDocumento === 'factura' && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#3E6328]">
                      <span>Datos de Facturación ante el SII</span>
                      <IconBuildingStore className="h-4 w-4 text-[#F58220]" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">RUT Empresa (con guión)</label>
                        <input
                          type="text"
                          value={rutEmpresa}
                          onChange={handleRutChange}
                          placeholder="77.123.456-8"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#3E6328]"
                          required
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Razón Social</label>
                        <input
                          type="text"
                          value={razonSocial}
                          onChange={(e) => setRazonSocial(e.target.value)}
                          placeholder="Gastronómica y Sabores SpA"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#3E6328]"
                          required
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block font-semibold text-slate-700 mb-1">Giro Comercial (Registrado en SII)</label>
                        <input
                          type="text"
                          value={giroComercial}
                          onChange={(e) => setGiroComercial(e.target.value)}
                          placeholder="Restaurantes y Comidas Preparadas"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#3E6328]"
                          required
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Dirección Tributaria</label>
                        <input
                          type="text"
                          value={direccionTributaria}
                          onChange={(e) => setDireccionTributaria(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#3E6328]"
                          required
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Comuna Tributaria</label>
                        <input
                          type="text"
                          value={comunaTributaria}
                          onChange={(e) => setComunaTributaria(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#3E6328]"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-2.5 bg-[#3E6328] hover:bg-[#2E4C1E] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    Continuar a Despacho →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Método de Entrega y Zonificación Temuco */}
            {currentStep === 2 && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                    <IconTruck className="h-5 w-5 text-[#3E6328]" />
                    Paso 2: Zonificación y Despacho en Temuco
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Camiones refrigerados con monitoreo térmico continuo para resguardar la cadena de frío.
                  </p>
                </div>

                {/* Zones Selector */}
                <div className="space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Selecciona tu Sector de Despacho:
                  </label>
                  {shippingZones.map((zone) => (
                    <div
                      key={zone.id}
                      onClick={() => handleZoneSelect(zone.id)}
                      role="button" tabIndex={0} aria-pressed={selectedZone.id === zone.id}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleZoneSelect(zone.id); } }}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        selectedZone.id === zone.id
                          ? 'border-[#3E6328] bg-blue-50/50 ring-2 ring-[#3E6328]/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          selectedZone.id === zone.id ? 'border-[#3E6328] bg-[#3E6328]' : 'border-slate-400'
                        }`}>
                          {selectedZone.id === zone.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <div>
                          <strong className="text-xs text-slate-900 block">{zone.name}</strong>
                          <span className="text-[11px] text-slate-500">
                            {zone.estimatedHours} • {zone.freeShippingThreshold > 0 ? `Gratis sobre ${formatCLPSimple(zone.freeShippingThreshold)}` : 'Sin costo'}
                          </span>
                        </div>
                      </div>

                      <span className="font-bold text-xs text-slate-900">
                        {zone.cost === 0 ? 'GRATIS' : formatCLPSimple(zone.cost)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Exact Address */}
                <div className="space-y-3 text-xs pt-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Dirección exacta de entrega (Calle, Número, Local o Depto)
                    </label>
                    <input
                      type="text"
                      value={direccionEntrega}
                      onChange={(e) => setDireccionEntrega(e.target.value)}
                      placeholder="Ej. Av. Alemania 0890, Local 3"
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-[#3E6328] ${
                        entrega?.ventaBloqueada
                          ? 'border-red-400 bg-red-50'
                          : 'border-slate-300'
                      }`}
                      required
                    />
                  </div>

                  {/* Estado de cobertura del despacho.
                      Se muestra apenas el cliente escribe la direccion,
                      para que sepa antes de pagar si le llega o no. */}
                  {verificando && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
                      <span className="w-3 h-3 border-2 border-[#3E6328] border-t-transparent rounded-full animate-spin" />
                      Verificando cobertura de entrega...
                    </div>
                  )}

                  {!verificando && entrega && (
                    <div
                      className={`flex items-start gap-2 text-[11px] px-3 py-2.5 rounded-lg border font-medium ${
                        entrega.ventaBloqueada
                          ? 'bg-red-50 border-red-300 text-red-800'
                          : entrega.aproximado
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      }`}
                    >
                      {entrega.ventaBloqueada ? (
                        <IconAlertCircle className="h-4 w-4 shrink-0 mt-px" />
                      ) : (
                        <IconShieldCheck className="h-4 w-4 shrink-0 mt-px" />
                      )}
                      <div>
                        <p>{entrega.mensaje}</p>
                        <p className="mt-1 opacity-75">
                          Distancia: {entrega.distanciaKm} km de la bodega
                          {entrega.radioMaximoKm > 0 && ` (radio ${entrega.radioMaximoKm} km)`}
                          {entrega.costoDespacho > 0 &&
                            ` · Despacho: ${formatCLPSimple(entrega.costoDespacho)}`}
                          {entrega.costoDespacho === 0 && ' · Despacho gratis'}
                        </p>
                        {entrega.aproximado && (
                          <p className="mt-1 text-[10px] opacity-70">
                            Distancia aproximada. Confirmaremos la entrega al contactarte.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Instrucciones de entrega / Horario preferente para el chofer
                    </label>
                    <textarea
                      rows={2}
                      value={instruccionesEntrega}
                      onChange={(e) => setInstruccionesEntrega(e.target.value)}
                      placeholder="Ej. Entregar por portón lateral de proveedores antes de las 12:00..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#3E6328]"
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    ← Volver
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="px-6 py-2.5 bg-[#3E6328] hover:bg-[#2E4C1E] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    Continuar a Pago →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Método de Pago */}
            {currentStep === 3 && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                    <IconCreditCard className="h-5 w-5 text-[#3E6328]" />
                    Paso 3: Método de Pago
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pasarelas seguras y opciones para cuentas comerciales verificadas.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Webpay Plus */}
                  <div
                    onClick={() => setPaymentMethod('webpay')}
                    role="button" tabIndex={0} aria-pressed={paymentMethod === 'webpay'}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPaymentMethod('webpay'); } }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      paymentMethod === 'webpay'
                        ? 'border-[#3E6328] bg-blue-50/50 ring-2 ring-[#3E6328]/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          paymentMethod === 'webpay' ? 'border-[#3E6328] bg-[#3E6328]' : 'border-slate-400'
                        }`}>
                          {paymentMethod === 'webpay' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <div>
                          <strong className="text-xs text-slate-900 block">Webpay Plus (Transbank)</strong>
                          <span className="text-[11px] text-slate-500">
                            Tarjetas de Débito (Redcompra), Crédito y Prepago
                          </span>
                        </div>
                      </div>
                      <span className="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200">
                        Inmediato
                      </span>
                    </div>
                  </div>

                  {/* Transferencia Directa */}
                  <div
                    onClick={() => setPaymentMethod('transferencia')}
                    role="button" tabIndex={0} aria-pressed={paymentMethod === 'transferencia'}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPaymentMethod('transferencia'); } }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      paymentMethod === 'transferencia'
                        ? 'border-[#3E6328] bg-blue-50/50 ring-2 ring-[#3E6328]/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          paymentMethod === 'transferencia' ? 'border-[#3E6328] bg-[#3E6328]' : 'border-slate-400'
                        }`}>
                          {paymentMethod === 'transferencia' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <div>
                          <strong className="text-xs text-slate-900 block">Transferencia Bancaria Directa</strong>
                          <span className="text-[11px] text-slate-500">
                            Cuenta Corriente Amyb Distribuidora Gastronómica SpA
                          </span>
                        </div>
                      </div>
                      <IconBuildingBank className="h-5 w-5 text-slate-400" />
                    </div>

                    {paymentMethod === 'transferencia' && (
                      <div className="mt-3 pt-3 border-t border-blue-200 text-[11px] text-slate-600 bg-white p-3 rounded-xl space-y-1">
                        <p><strong>Banco:</strong> Banco de Chile</p>
                        <p><strong>Tipo de Cuenta:</strong> Cuenta Corriente</p>
                        <p><strong>Número:</strong> 00-123-45678-90</p>
                        <p><strong>RUT:</strong> 77.456.789-0 (Amyb SpA)</p>
                        <p><strong>Email Comprobante:</strong> pagos@amybdistribuidora.cl</p>
                      </div>
                    )}
                  </div>

                  {/* Contra Entrega */}
                  <div
                    onClick={() => setPaymentMethod('contra_entrega')}
                    role="button" tabIndex={0} aria-pressed={paymentMethod === 'contra_entrega'}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPaymentMethod('contra_entrega'); } }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      paymentMethod === 'contra_entrega'
                        ? 'border-[#3E6328] bg-blue-50/50 ring-2 ring-[#3E6328]/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          paymentMethod === 'contra_entrega' ? 'border-[#3E6328] bg-[#3E6328]' : 'border-slate-400'
                        }`}>
                          {paymentMethod === 'contra_entrega' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <div>
                          <strong className="text-xs text-slate-900 block">Pago Contra Entrega (HORECA)</strong>
                          <span className="text-[11px] text-slate-500">
                            Pago en efectivo o con máquina POS móvil al chofer al recibir la carga
                          </span>
                        </div>
                      </div>
                      <IconCash className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    ← Volver
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitOrder}
                    disabled={isSubmitting}
                    className="px-8 py-3 bg-[#F58220] hover:bg-[#E07113] text-white font-extrabold text-sm rounded-xl transition-all shadow-md active:scale-98 cursor-pointer flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <span>Procesando Pedido...</span>
                    ) : (
                      <>
                        <IconCheck className="h-4 w-4" />
                        <span>Confirmar Pedido ({formatCLPSimple(total)})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Sticky Summary (5 cols) */}
          <div className="lg:col-span-5 bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between self-start sticky top-4">
            <div>
              <h4 className="font-display font-bold text-sm text-slate-900 pb-3 border-b border-slate-200">
                Resumen de la Orden
              </h4>

              {/* Items scroll */}
              <div className="divide-y divide-slate-200 max-h-56 overflow-y-auto my-3 pr-1">
                {cartItems.map((item) => {
                  // El precio mostrado debe ser el MISMO que cobrara el
                  // servidor, incluido el descuento del nivel del cliente.
                  const unit = precioConNivelCliente(
                    item.product,
                    item.quantity,
                    nivelCliente
                  );
                  const precioVolumen = precioUnitario(item.product, item.quantity);
                  const conNivel = unit < precioVolumen;
                  const escalonado = precioVolumen < item.product.price;

                  return (
                    <div key={item.product.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <strong className="block text-slate-900 truncate">
                          {item.product.name}
                        </strong>
                        <span className="text-slate-500 text-[11px]">
                          {item.quantity} x {formatCLPSimple(unit)} ({item.product.format})
                        </span>
                        {escalonado && (
                          <span className="block text-[10px] font-bold text-emerald-600">
                            Precio mayorista aplicado
                          </span>
                        )}
                        {conNivel && nivelCliente && (
                          <span className="block text-[10px] font-bold text-orange-600">
                            Descuento {nivelCliente.nombre} (-{nivelCliente.descuentoPercent}%)
                          </span>
                        )}
                        {item.product.minWholesaleQty > 1 && item.quantity < item.product.minWholesaleQty && (
                          <span className="block text-[10px] font-bold text-amber-600">
                            Minimo mayorista: {item.product.minWholesaleQty} un.
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-slate-900 shrink-0">
                        {formatCLPSimple(unit * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Etiqueta del nivel de precio del cliente */}
              {nivelCliente && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 mb-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <span className="text-[11px] font-bold text-orange-800">
                    Precio especial: {nivelCliente.nombre}
                  </span>
                  <span className="text-[11px] font-bold text-orange-800">
                    -{nivelCliente.descuentoPercent}%
                  </span>
                </div>
              )}

              {/* Accounting details */}
              <div className="space-y-1.5 text-xs text-slate-600 pt-3 border-t border-slate-200">
                <div className="flex justify-between">
                  <span>Subtotal Bruto:</span>
                  <span className="font-semibold text-slate-900">{formatCLPSimple(subtotal)}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Descuento ({couponCode}):</span>
                    <span>-{formatCLPSimple(discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Neto Tributario:</span>
                  <span>{formatCLPSimple(neto)}</span>
                </div>

                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>IVA (19% DTE):</span>
                  <span>{formatCLPSimple(iva)}</span>
                </div>

                <div className="flex justify-between">
                  <span>Despacho ({selectedZone.comuna}):</span>
                  {shippingCost === 0 ? (
                    <span className="text-emerald-600 font-bold text-[11px]">GRATIS</span>
                  ) : (
                    <span className="font-semibold text-slate-900">{formatCLPSimple(shippingCost)}</span>
                  )}
                </div>

                <div className="flex justify-between text-base font-bold text-slate-900 pt-3 border-t border-slate-300">
                  <span>Total Final:</span>
                  <span className="text-[#3E6328] font-display text-xl">
                    {formatCLPSimple(total)} CLP
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 text-center">
              <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                <IconShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Factura emitida automáticamente al despachar</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
