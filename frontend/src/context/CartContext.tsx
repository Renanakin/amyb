import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product, CartItem, ShippingZone, OrderSummary } from '../types';
import { api, FALLBACK_SHIPPING_ZONES } from '../services/api';
import { useAuth } from './AuthContext';
import { precioUnitario, precioConNivelCliente } from '../utils/precios';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  isCheckoutOpen: boolean;
  setCheckoutOpen: (open: boolean) => void;
  isDteLedgerOpen: boolean;
  setDteLedgerOpen: (open: boolean) => void;
  completedOrder: OrderSummary | null;
  setCompletedOrder: (order: OrderSummary | null) => void;
  shippingZones: ShippingZone[];
  selectedZone: ShippingZone;
  setSelectedZone: (zone: ShippingZone) => void;
  couponCode: string;
  discountAmount: number;
  applyCoupon: (code: string) => { success: boolean; message: string };
  activeCategory: string;
  setActiveCategory: (cat: string) => void;
  activeBrand: string;
  setActiveBrand: (brand: string) => void;
  isMegaMenuOpen: boolean;
  setMegaMenuOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  /** Nivel de precio del cliente. Solo afecta lo que se muestra. */
  nivelCliente: {
    id: string;
    nombre: string;
    descuentoPercent: number;
    aplicaSobreEscalon: boolean;
  } | null;
  // Computed
  itemCount: number;
  subtotal: number;
  neto: number;
  iva: number;
  shippingCost: number;
  freeShippingThreshold: number;
  freeShippingProgress: number;
  remainingForFreeShipping: number;
  hasFreeShipping: boolean;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Un carrito nuevo inicia vacío. Se conservan el guardado local y la sincronización.

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // El carrito se sincroniza con el servidor cuando hay sesion activa.
  const { isAuthenticated, user } = useAuth();

  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('amyb_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setCartOpen] = useState(false);
  const [isCheckoutOpen, setCheckoutOpen] = useState(false);
  const [isDteLedgerOpen, setDteLedgerOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<OrderSummary | null>(null);
  const [shippingZones, setShippingZones] = useState<ShippingZone[]>(FALLBACK_SHIPPING_ZONES);
  const [selectedZone, setSelectedZone] = useState<ShippingZone>(FALLBACK_SHIPPING_ZONES[0]);
  const [couponCode, setCouponCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [activeCategory, setActiveCategory] = useState('todos');
  const [activeBrand, setActiveBrand] = useState('todas');
  const [isMegaMenuOpen, setMegaMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync with backend zones
  useEffect(() => {
    api.getShippingZones().then(zones => {
      if (zones && zones.length > 0) {
        setShippingZones(zones);
        setSelectedZone(zones[0]);
      }
    });
  }, []);

  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem('amyb_cart', JSON.stringify(cartItems));
  }, [cartItems]);

  // -------------------------------------------------------------------
  // Sincronizacion con el servidor
  // -------------------------------------------------------------------
  // Al iniciar sesion: se sube el carrito anonimo que estaba en el
  // navegador y se carga la version fusionada del servidor. Asi el
  // carrito sigue al usuario entre celular y computador.
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let cancelled = false;

    const localItems = cartItems.map((i) => ({
      productId: i.product.id,
      quantity: i.quantity
    }));

    fetch('/api/cart/sync', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: localItems })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        setCartItems(data.data.items);
        if (localItems.length > 0) {
          showToast('Carrito sincronizado con tu cuenta');
        }
      })
      .catch(() => {
        // Sin conexion: se sigue con el carrito local
      });

    return () => {
      cancelled = true;
    };
    // Solo al cambiar de usuario, no en cada cambio del carrito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  // Al cerrar sesion: se restaura el carrito anonimo del navegador
  useEffect(() => {
    if (isAuthenticated) return;
    try {
      const saved = localStorage.getItem('amyb_cart');
      if (saved) setCartItems(JSON.parse(saved));
    } catch {
      // sin datos guardados
    }
  }, [isAuthenticated]);

  // El nivel de precio del cliente. Se usa solo para MOSTRAR el precio;
  // el backend lo recalcula al crear el pedido.
  const nivelCliente = user?.priceTier ?? null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  /**
   * Agrega un producto al carrito.
   *
   * REGLA: lo que ve el cliente SIEMPRE tiene que coincidir con lo que
   * hay guardado en el servidor. Antes, esta funcion actualizaba la
   * pantalla al instante y mandaba el fetch "por las dudas": si el
   * servidor rechazaba la operacion (por ejemplo, por estar bajo el
   * minimo mayorista), el catch se comia el error y la pantalla
   * mostraba una cantidad que la base no tenia. El cliente avanzaba al
   * checkout viendo un total distinto al que se le iba a cobrar.
   *
   * Ahora: primero se valida, se agrega, y si el servidor rechaza se
   * revierte el estado local y se avisa.
   */
  const addToCart = async (product: Product, quantity = 1) => {
    const yaEnCarrito = cartItems.find((i) => i.product.id === product.id);
    const cantidadFinal = (yaEnCarrito?.quantity ?? 0) + quantity;

    // Validacion en pantalla: el minimo mayorista no se negocia
    if (product.minWholesaleQty > 1 && cantidadFinal < product.minWholesaleQty) {
      showToast(
        `${product.name} se vende en presentaciones de ${product.minWholesaleQty} unidades`
      );
      return;
    }

    if (cantidadFinal > product.stock) {
      showToast(`Solo quedan ${product.stock} unidades de ${product.name}`);
      return;
    }

    setCartItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    showToast(`✓ Añadido al carrito: ${product.name}`);

    if (!isAuthenticated) return;

    try {
      const res = await fetch('/api/cart/items', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, quantity })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // El servidor no acepto: se revierte para no mostrar de mas
        setCartItems(prev => {
          const existente = prev.find(item => item.product.id === product.id);
          if (!existente) return prev;
          const nueva = existente.quantity - quantity;
          if (nueva <= 0) return prev.filter(item => item.product.id !== product.id);
          return prev.map(item =>
            item.product.id === product.id ? { ...item, quantity: nueva } : item
          );
        });
        showToast(err.message || 'No se pudo agregar al carrito');
      }
    } catch {
      // Sin servidor: se revierte igual, para no prometer una venta
      // que nadie registro
      setCartItems(prev => {
        const existente = prev.find(item => item.product.id === product.id);
        if (!existente) return prev;
        const nueva = existente.quantity - quantity;
        if (nueva <= 0) return prev.filter(item => item.product.id !== product.id);
        return prev.map(item =>
          item.product.id === product.id ? { ...item, quantity: nueva } : item
        );
      });
      showToast('Sin conexión con el servidor. No se agregó al carrito.');
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const item = cartItems.find((i) => i.product.id === productId);
    if (!item) return;

    // No se baja del minimo mayorista ni se supera el stock
    if (quantity < item.product.minWholesaleQty) {
      showToast(`Minimo ${item.product.minWholesaleQty} unidades`);
      return;
    }
    if (quantity > item.product.stock) {
      showToast(`Solo quedan ${item.product.stock} unidades`);
      return;
    }

    setCartItems(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );

    if (isAuthenticated) {
      fetch(`/api/cart/items/${productId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity })
      })
        .then(async (res) => {
          if (res.ok) return;
          const err = await res.json().catch(() => ({}));
          showToast(err.message || 'No se pudo actualizar la cantidad');
        })
        .catch(() => showToast('Sin conexión: cantidad no guardada'));
    }
  };

  const removeFromCart = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.product.id !== productId));
    showToast('Producto eliminado del carrito');

    if (isAuthenticated) {
      fetch(`/api/cart/items/${productId}`, {
        method: 'DELETE',
        credentials: 'include'
      }).catch(() => {});
    }
  };

  const clearCart = () => {
    setCartItems([]);
    setDiscountAmount(0);
    setCouponCode('');

    if (isAuthenticated) {
      fetch('/api/cart', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    }
  };

  const applyCoupon = (code: string) => {
    const norm = code.trim().toUpperCase();
    if (norm === 'AMYB10' || norm === 'BIENVENIDA') {
      const disc = Math.round(subtotal * 0.1);
      setDiscountAmount(disc);
      setCouponCode(norm);
      showToast(`¡Cupón ${norm} aplicado! (10% Dcto.)`);
      return { success: true, message: '10% de descuento aplicado con éxito.' };
    } else if (norm === 'HORECA2026') {
      const disc = Math.round(subtotal * 0.15);
      setDiscountAmount(disc);
      setCouponCode(norm);
      showToast(`¡Cupón HORECA 2026 aplicado! (15% Dcto.)`);
      return { success: true, message: '15% de descuento especial HORECA aplicado.' };
    } else {
      showToast('Cupón no válido o vencido');
      return { success: false, message: 'El cupón ingresado no es válido.' };
    }
  };

  // Calculations
  const itemCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  /**
   * Subtotal con el precio REAL de cada linea.
   *
   * Antes usaba product.price (el de lista) y el total mostrado no
   * cuadraba con lo que cobran: el detalle decia "$8.490 por unidad" y
   * el subtotal abajo sumaba a $9.490. El cliente veia un numero y
   * Transbank le cobraba otro.
   *
   * El servidor aplica la misma regla en PricingService.
   */
  const subtotal = cartItems.reduce(
    (acc, item) => acc + precioConNivelCliente(item.product, item.quantity, nivelCliente) * item.quantity,
    0
  );

  const freeShippingThreshold = selectedZone?.freeShippingThreshold || 35000;
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const hasFreeShipping = freeShippingThreshold > 0 ? subtotal >= freeShippingThreshold : true;
  const freeShippingProgress = freeShippingThreshold > 0
    ? Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100))
    : 100;
  const shippingCost = hasFreeShipping || selectedZone?.cost === 0 ? 0 : (selectedZone?.cost || 2990);
  const subtotalConDescuento = Math.max(0, subtotal - discountAmount);
  const neto = Math.round(subtotalConDescuento / 1.19);
  const iva = subtotalConDescuento - neto;
  const total = subtotalConDescuento + shippingCost;

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        isCartOpen,
        setCartOpen,
        isCheckoutOpen,
        setCheckoutOpen,
        isDteLedgerOpen,
        setDteLedgerOpen,
        completedOrder,
        setCompletedOrder,
        shippingZones,
        selectedZone,
        setSelectedZone,
        couponCode,
        discountAmount,
        applyCoupon,
        activeCategory,
        setActiveCategory,
        activeBrand,
        setActiveBrand,
        isMegaMenuOpen,
        setMegaMenuOpen,
        searchQuery,
        setSearchQuery,
        toastMessage,
        showToast,
        // Nivel de precio del cliente, para que los componentes muestren
        // el precio correcto segun su acuerdo comercial
        nivelCliente,
        itemCount,
        subtotal,
        neto,
        iva,
        shippingCost,
        freeShippingThreshold,
        freeShippingProgress,
        remainingForFreeShipping,
        hasFreeShipping,
        total
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
