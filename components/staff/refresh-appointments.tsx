"use client";
import {useEffect,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {RefreshCw} from 'lucide-react';
export default function RefreshAppointments(){
 const router=useRouter(),[pending,startTransition]=useTransition();
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')router.refresh();};const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[router]);
 return <button type="button" className="btn outline" disabled={pending} onClick={()=>startTransition(()=>router.refresh())}><RefreshCw aria-hidden="true"/>{pending?'Refreshing...':'Refresh queue'}</button>;
}
