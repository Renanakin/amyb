import React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { AuthModal } from './components/AuthModal';
import { StorefrontLayout } from './storefront/Layout';
import { Home } from './storefront/Home';
import { Catalog } from './storefront/Catalog';
import { ProductPage } from './storefront/ProductPage';
import { AccountPage, CheckoutPage, HelpPage, NotFound, WholesalePage } from './storefront/Pages';
import { MyOrdersPage } from './pages/MyOrdersPage';
import { PaymentReturnPage } from './pages/PaymentReturnPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { PrintInvoicePage } from './pages/PrintInvoicePage';
import { AdminPanel } from './pages/AdminPanel';
import './storefront/storefront.css';

/**
 * Una sola tienda responsive. Los servicios, proveedores y rutas de los
 * procesos de compra se conservan; no existe una tienda móvil alternativa.
 * El panel de administración y la impresión mantienen sus propias vistas.
 */
export function AppContent() {
 const location=useLocation();
 if(location.pathname.startsWith('/admin'))return <><AdminPanel/><div className="amyb-store feature-surfaces"><AuthModal/></div></>;
 return <Routes>
  <Route path="/documento/:orderId" element={<PrintInvoicePage/>}/>
  <Route element={<StorefrontLayout/>}>
   <Route index element={<Home/>}/>
   <Route path="/catalogo" element={<Catalog/>}/>
   <Route path="/favoritos" element={<Catalog favoritesOnly/>}/>
   <Route path="/producto/:sku" element={<ProductPage/>}/>
   <Route path="/cuenta" element={<AccountPage/>}/>
   <Route path="/checkout" element={<CheckoutPage/>}/>
   <Route path="/mis-pedidos" element={<div className="feature-surfaces"><MyOrdersPage/></div>}/>
   <Route path="/webpay/return" element={<div className="feature-surfaces"><PaymentReturnPage/></div>}/>
   <Route path="/recuperar-contrasena" element={<div className="feature-surfaces"><ResetPasswordPage/></div>}/>
   <Route path="/ayuda" element={<HelpPage/>}/>
   <Route path="/mayoristas" element={<WholesalePage/>}/>
   <Route path="*" element={<NotFound/>}/>
  </Route>
 </Routes>;
}
export function App(){return <AuthProvider><CartProvider><AppContent/></CartProvider></AuthProvider>;}
export default App;
