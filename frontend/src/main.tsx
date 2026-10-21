import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {/* BrowserRouter habilita las rutas con URL reales: /producto/:sku y
        /mis-pedidos. Va por fuera de App para que el contexto de
        autenticacion y el carrito no se recreen al navegar. */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
