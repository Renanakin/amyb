import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { AuthModal } from '../components/AuthModal';
import { AccountPanel } from '../components/AccountPanel';
import { DteLedgerModal } from '../components/DteLedgerModal';
import { OrderConfirmationModal } from '../components/OrderConfirmationModal';
import { StoreProvider, businesses, categories, money } from './data';
import { Dialog, Icon } from './ui';
import { StoreCart } from './StoreCart';

function Header(){
 const {user}=useAuth();
 const {itemCount,total,setCartOpen}=useCart();
 const navigate=useNavigate(),location=useLocation();
 const [query,setQuery]=useState(new URLSearchParams(location.search).get('q')||'');
 const [menu,setMenu]=useState(false);
 useEffect(()=>{setMenu(false);setQuery(new URLSearchParams(location.search).get('q')||'');},[location.pathname,location.search]);
 function search(e:FormEvent){e.preventDefault();navigate('/catalogo'+(query.trim()?'?q='+encodeURIComponent(query.trim()):''));}
 return <>
 <div className="service-bar container"><Icon name="pin"/><span>Tu distribuidora en Temuco</span><div className="service-links"><Link to="/ayuda">Despacho y retiro</Link><Link to="/ayuda">Sucursales y contacto</Link></div></div>
 <header className="header"><div className="container header-main">
 <Link className="brand" to="/" aria-label="Amyb, ir al inicio"><img src="/logo-amyb.png" alt="Amyb Distribuidora" width="150" height="70"/></Link>
 <button className="category-button" onClick={()=>setMenu(true)} aria-label="Abrir categorías" aria-haspopup="dialog"><Icon name="menu"/><span>Categorías</span><Icon name="down"/></button>
 <form className="search-form" role="search" onSubmit={search}><label className="sr-only" htmlFor="store-search">Buscar productos</label><Icon name="search"/><input id="store-search" type="search" placeholder="¿Qué necesitas para tu cocina?" autoComplete="off" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit" aria-label="Buscar productos"><Icon name="arrow"/></button></form>
 <div className="header-actions"><Link className="icon-link optional" to="/favoritos" aria-label="Mis favoritos"><Icon name="heart"/></Link><Link className="account-link" to="/cuenta" aria-label="Mi cuenta"><Icon name="user"/><span>{user?user.nombre.split(' ')[0]:'Mi cuenta'}</span></Link><button className="cart-button" onClick={()=>setCartOpen(true)} aria-label={'Abrir carrito, '+itemCount+' unidades'}><span className="cart-symbol"><Icon name="bag"/><b>{itemCount}</b></span><span className="cart-label">Mi carrito<strong>{money(total)}</strong></span></button></div></div>
 <nav className="container nav-row" aria-label="Navegación principal"><Link to="/catalogo">Todos los productos</Link><Link to="/catalogo?categoria=abarrotes">Despensa</Link><Link to="/catalogo?categoria=lacteos">Lácteos y quesos</Link><Link to="/catalogo?categoria=congelados">Congelados</Link><Link className="nav-offers" to="/catalogo?ofertas=1"><Icon name="tag"/>Ofertas</Link><span className="nav-spacer"/><span className="nav-caption">Para tu negocio</span><Link to="/catalogo?rubro=sushi">Sushi</Link><Link to="/catalogo?rubro=pizza">Pizza</Link><Link to="/catalogo?rubro=restaurante">Restaurante</Link></nav></header>
 <nav className="mobile-nav" aria-label="Navegación móvil"><NavLink to="/" end><Icon name="home"/>Inicio</NavLink><button onClick={()=>setMenu(true)}><Icon name="grid"/>Categorías</button><Link to="/catalogo?ofertas=1"><Icon name="tag"/>Ofertas</Link><NavLink to="/cuenta"><Icon name="user"/>Mi cuenta</NavLink><button onClick={()=>setCartOpen(true)}><Icon name="bag"/>Carrito <b>{itemCount}</b></button></nav>
 <Dialog open={menu} onClose={()=>setMenu(false)} title="Categorías de productos" className="menu-dialog"><div className="dialog-top"><h2>¿Qué estás buscando?</h2><button className="icon-button" onClick={()=>setMenu(false)} aria-label="Cerrar categorías"><Icon name="close"/></button></div><div className="menu-columns"><div><h3>Por producto</h3>{categories.map(c=><Link key={c.id} to={'/catalogo'+(c.id==='todos'?'':'?categoria='+c.id)} onClick={()=>setMenu(false)}><Icon name={c.icon}/>{c.name}<Icon name="arrow"/></Link>)}</div><div><h3>Para tu negocio</h3>{businesses.map(b=><Link key={b.id} to={'/catalogo?rubro='+b.id} onClick={()=>setMenu(false)}><Icon name={b.icon}/>{b.name}<Icon name="arrow"/></Link>)}<Link to="/mayoristas" onClick={()=>setMenu(false)}><Icon name="box"/>Ventas mayoristas<Icon name="arrow"/></Link></div></div></Dialog>
 </>;
}
function Footer(){return <footer className="footer"><div className="container footer-grid"><div className="footer-about"><Link to="/" className="footer-logo"><img src="/logo-amyb.png" alt="Amyb Distribuidora" width="150" height="70"/></Link><p>Lo que tu cocina necesita,<br/>más cerca de ti.</p><span className="footer-location"><Icon name="pin"/>Temuco, Chile</span></div><div><h2>Encuentra tus productos</h2><Link to="/catalogo?categoria=abarrotes">Despensa</Link><Link to="/catalogo?categoria=lacteos">Lácteos y quesos</Link><Link to="/catalogo?categoria=congelados">Congelados</Link><Link to="/catalogo?categoria=envases">Envases e insumos</Link></div><div><h2>Para tu negocio</h2>{businesses.map(b=><Link key={b.id} to={'/catalogo?rubro='+b.id}>{b.name}</Link>)}<Link to="/mayoristas">Ventas mayoristas</Link></div><div><h2>Estamos para ayudarte</h2><Link to="/ayuda">Despacho y retiro</Link><Link to="/ayuda">Sucursales y contacto</Link><Link to="/cuenta">Mi cuenta</Link><Link to="/mis-pedidos">Mis pedidos y documentos</Link></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Amyb Distribuidora</span><Link to="/ayuda">Información de compra</Link></div></footer>;}
function StoreFrame(){
 const location=useLocation();
 const {toastMessage}=useCart();
 const main=useRef<HTMLElement>(null);
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant' as ScrollBehavior});main.current?.focus({preventScroll:true});},[location.pathname]);
 return <div className="amyb-store"><a className="skip" href="#contenido" onClick={e=>{e.preventDefault();main.current?.focus();}}>Saltar al contenido</a><Header/><main id="contenido" ref={main} tabIndex={-1}><Outlet/></main><Footer/><StoreCart/><div className="feature-surfaces"><AuthModal/><AccountPanel/><DteLedgerModal/><OrderConfirmationModal/></div>{toastMessage&&<div className="toast visible" role="status" aria-live="polite">{toastMessage}</div>}</div>;
}
export function StorefrontLayout(){return <StoreProvider><StoreFrame/></StoreProvider>;}
