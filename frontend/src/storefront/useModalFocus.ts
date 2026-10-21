import { useEffect, useRef } from 'react';

/** Foco, Escape y bloqueo de desplazamiento para los paneles existentes. */
export function useModalFocus(active:boolean,id:string,onClose:()=>void){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  if(!active)return;
  const dialog=document.getElementById(id);
  if(!dialog)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const candidates=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(e=>e.getClientRects().length>0);
  const frame=requestAnimationFrame(()=>{(candidates()[0]||dialog).focus();});
  const keydown=(e:KeyboardEvent)=>{
   const all=document.querySelectorAll('[data-amyb-modal]');
   if(all[all.length-1]!==dialog)return;
   if(e.key==='Escape'){e.preventDefault();close.current();return;}
   if(e.key!=='Tab')return;
   const nodes=candidates();
   if(!nodes.length){e.preventDefault();dialog.focus();return;}
   const first=nodes[0],last=nodes[nodes.length-1];
   if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',keydown);
  return ()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[active,id]);
}
