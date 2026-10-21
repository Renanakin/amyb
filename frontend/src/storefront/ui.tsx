import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { cantidadInicial, precioConNivelCliente } from '../utils/precios';
import { categoryName, money, productImage, useStore } from './data';

const paths:Record<string,string>={
search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
down:'<path d="m6 9 6 6 6-6"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
heart:'<path d="M20.3 4.7a5.5 5.5 0 0 0-7.8 0l-.5.5-.5-.5a5.5 5.5 0 0 0-7.8 7.8L12 21l8.3-8.5a5.5 5.5 0 0 0 0-7.8Z"/>',
user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
tag:'<path d="m21 11-10 10L2 12V3h9l10 8Z"/><circle cx="7" cy="8" r="1"/>',
truck:'<path d="M2 5h12v12H2V5Zm12 5h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
leaf:'<path d="M20 3C7 1 2 7 5 14c3 7 15 7 15-11Z"/><path d="m4 21 11-13"/>',
box:'<path d="m12 2 10 5v10l-10 5-10-5V7l10-5Zm0 10L2 7m10 5 10-5M12 12v10M7 4.5l10 5"/>',
grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
home:'<path d="m2 10 10-8 10 8M5 8v13h14V8M9 21v-8h6v8"/>',
close:'<path d="m6 6 12 12M6 18 18 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
check:'<path d="m4 12 5 5L20 6"/>',
tune:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
pizza:'<path d="m12 3 10 18L2 17 12 3Zm-3 2 10 4"/><circle cx="10" cy="13" r="1.5"/><circle cx="15.5" cy="17" r="1"/>',
sushi:'<ellipse cx="12" cy="8" rx="9" ry="5"/><path d="M3 8v8c0 7 18 7 18 0V8"/><ellipse cx="12" cy="8" rx="3" ry="2"/>',
utensils:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M18 3c-4 3-4 9 0 9V3Zm0 9v9"/>',
sandwich:'<path d="M3 12h18M3 8c1-7 17-7 18 0H3Zm0 8h18v4H3v-4Zm0-4 5 3 4-3 4 3 5-3"/>',
snow:'<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/>'
};
export function Icon({name}:{name:string}) {
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{__html:paths[name]||paths.box}}/>;
}
export function Dialog({open,onClose,title,children,className=''}:{open:boolean;onClose:()=>void;title:string;children:React.ReactNode;className?:string}) {
 const ref=useRef<HTMLDialogElement>(null);
 const closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{const d=ref.current;if(!d)return;if(open&&!d.open)d.showModal();else if(!open&&d.open)d.close();},[open]);
 return <dialog ref={ref} className={className} aria-label={title} onCancel={onClose} onClose={()=>closeRef.current()} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}>{children}</dialog>;
}
export function ProductImage({product,priority=false}:{product:Product;priority?:boolean}) {
 const src=productImage(product);
 return src?<img src={src} alt={product.name} width="280" height="280" loading={priority?'eager':'lazy'} onError={e=>{e.currentTarget.style.display='none';e.currentTarget.parentElement?.classList.add('image-unavailable');}}/>:<span className="image-placeholder"><Icon name="box"/><span>Imagen por actualizar</span></span>;
}
export function Favorite({product}:{product:Product}){
 const {favorites,toggleFavorite}=useStore();
 const active=favorites.includes(product.id);
 return <button type="button" className="favorite-button" aria-label={(active?'Quitar de':'Guardar en')+' favoritos: '+product.name} aria-pressed={active} onClick={()=>toggleFavorite(product.id)}><Icon name="heart"/></button>;
}
export function ProductCard({product:p}:{product:Product}){
 const {addToCart,nivelCliente}=useCart();
 const qty=cantidadInicial(p), available=p.stock>=qty;
 return <article className="product-card"><Favorite product={p}/><Link className="product-media" to={'/producto/'+encodeURIComponent(p.sku)} tabIndex={-1} aria-hidden="true"><ProductImage product={p}/></Link><span className="product-brand">{p.brand}</span><h3 className="product-title"><Link to={'/producto/'+encodeURIComponent(p.sku)}>{p.name}</Link></h3><p className="product-format">{p.format}</p><div className="price-row"><span className="price">{money(precioConNivelCliente(p,qty,nivelCliente))}</span><span className="unit">/ unidad</span></div><span className={'product-state '+(!available?'out':'')}>{p.stock<=0?'Agotado':!available?'Stock menor al mínimo':qty>1?'Mínimo '+qty+' unidades':'Disponible'}</span>{available?<button className="button primary add-button" onClick={()=>addToCart(p,qty)}><Icon name="plus"/>{qty>1?'Agregar '+qty:'Agregar'}</button>:<Link className="button secondary add-button" to={'/producto/'+encodeURIComponent(p.sku)}>Ver producto</Link>}</article>;
}
export function ProductGrid({products,home=false}:{products:Product[];home?:boolean}){return <div className={'product-grid '+(home?'home-products':'catalog-products')}>{products.map(p=><ProductCard key={p.id} product={p}/>)}</div>;}
export function Empty({title,children}:{title:string;children?:React.ReactNode}){return <div className="empty"><Icon name="search"/><h2>{title}</h2>{children}</div>;}
export function CatalogStatus(){const {loading,error,reload,products}=useStore();if(loading)return <div className="catalog-loading" role="status">Cargando productos…<div className="skeleton-grid">{[0,1,2,3,4].map(i=><div key={i}/>)}</div></div>;if(error)return <div className="empty" role="alert"><Icon name="box"/><h2>No pudimos cargar el catálogo</h2><p>{error}</p><button className="button primary" onClick={reload}>Volver a intentar</button></div>;if(!products.length)return <Empty title="Estamos preparando nuestro catálogo"><p>Pronto encontrarás aquí los productos disponibles.</p></Empty>;return null;}
export function Breadcrumb({label,category}:{label:string;category?:string}){return <nav className="breadcrumb" aria-label="Ruta de navegación"><Link to="/">Inicio</Link><span>/</span>{category&&<><Link to={'/catalogo?categoria='+category}>{categoryName(category)}</Link><span>/</span></>}<span aria-current="page">{label}</span></nav>;}
export function Stepper({value,min=1,max=99,onChange,label}:{value:number;min?:number;max?:number;onChange:(n:number)=>void;label:string}){return <div className="stepper"><button type="button" aria-label={'Reducir cantidad de '+label} disabled={value<=min} onClick={()=>onChange(value-1)}><Icon name="minus"/></button><input type="number" min={min} max={max} aria-label={'Cantidad de '+label} value={value} onChange={e=>{const n=Number(e.target.value);onChange(Math.max(min,Math.min(max,Number.isFinite(n)?Math.trunc(n):min)));}}/><button type="button" aria-label={'Aumentar cantidad de '+label} disabled={value>=max} onClick={()=>onChange(value+1)}><Icon name="plus"/></button></div>;}
