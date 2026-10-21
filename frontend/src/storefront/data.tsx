import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Product } from '../types';

export const categories = [
 {id:'abarrotes',name:'Despensa',image:'arroz.jpg',icon:'box'},
 {id:'lacteos',name:'Lácteos y quesos',image:'prairies.jpg',icon:'box'},
 {id:'congelados',name:'Congelados',image:'camaron.jpg',icon:'snow'},
 {id:'sushi',name:'Especial Sushi',image:'greenbay.jpg',icon:'sushi'},
 {id:'envases',name:'Envases e insumos',image:'pano.jpg',icon:'box'},
 {id:'todos',name:'Todo el catálogo',image:'aceituna.jpg',icon:'grid'}
];
export const businesses = [
 {id:'sushi',name:'Sushi',sub:'Los esenciales de tus preparaciones.',icon:'sushi'},
 {id:'pizza',name:'Pizzería',sub:'Ingredientes para cada pedido.',icon:'pizza'},
 {id:'restaurante',name:'Restaurante',sub:'Completa tu cocina en un lugar.',icon:'utensils'},
 {id:'sandwich',name:'Sandwich',sub:'Sabores que acompañan tu carta.',icon:'sandwich'}
];
export const money=(n:number)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n);
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const categoryName=(id:string)=>categories.find(c=>c.id===id)?.name||id;
export function matchesBusiness(p:Product,b:string) {
 const name=normalize(p.name+' '+p.categoryName+' '+p.description);
 if(b==='sushi')return p.category==='sushi'||/sushi|queso crema|camaron|atun|nori|panko/.test(name);
 if(b==='pizza')return p.category==='lacteos'||/pizza|mozzarella|aceituna|tomate|oregano/.test(name);
 if(b==='sandwich')return /sandwich|hamburgues|mayonesa|ketchup|mostaza|cheddar|pan |sachet/.test(name)||p.category==='envases';
 return true;
}
// Sustitución únicamente de fotos genéricas por referencias del mismo SKU.
// Las imágenes específicas administradas en la API siempre tienen prioridad.
export function productImage(p:Product) {
 if(p.image&&!p.image.includes('images.unsplash.com'))return p.image;
 const exact:Record<string,{file:string;name:RegExp}>={
  'LAC-GB-1360':{file:'greenbay.jpg',name:/green bay/i},
  'LAC-PF-1360':{file:'prairies.jpg',name:/prairi/i}
 };
 const candidate=exact[p.sku];
 return candidate&&candidate.name.test(p.name)?'/storefront/'+candidate.file:(p.image||'');
}
interface StoreData {
 products:Product[]; loading:boolean; error:string|null; reload:()=>void;
 favorites:string[]; toggleFavorite:(id:string)=>void;
}
const Context=createContext<StoreData|undefined>(undefined);
export function StoreProvider({children}:{children:React.ReactNode}) {
 const [products,setProducts]=useState<Product[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 const [favorites,setFavorites]=useState<string[]>(()=>{
  try {const data=JSON.parse(localStorage.getItem('amyb_favorites')||'[]');return Array.isArray(data)?data.filter((x:unknown)=>typeof x==='string'):[];}catch{return [];}
 });
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError(null);
  fetch('/api/products',{signal:controller.signal})
   .then(async r=>{if(!r.ok)throw new Error();const data=await r.json();if(!data.success||!Array.isArray(data.data))throw new Error();return data.data as Product[];})
   .then(data=>{if(!controller.signal.aborted)setProducts(data);})
   .catch(()=>{if(!controller.signal.aborted){setProducts([]);setError('No pudimos cargar los productos. Intenta nuevamente en unos momentos.');}})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[revision]);
 useEffect(()=>{try{localStorage.setItem('amyb_favorites',JSON.stringify(favorites));}catch{}},[favorites]);
 const reload=useCallback(()=>setRevision(n=>n+1),[]);
 const toggleFavorite=useCallback((id:string)=>setFavorites(list=>list.includes(id)?list.filter(x=>x!==id):[...list,id]),[]);
 return <Context.Provider value={{products,loading,error,reload,favorites,toggleFavorite}}>{children}</Context.Provider>;
}
export function useStore(){const value=useContext(Context);if(!value)throw new Error('StoreProvider no disponible');return value;}
