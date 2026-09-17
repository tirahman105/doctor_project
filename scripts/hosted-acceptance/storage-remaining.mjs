import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {png} from './storage-tests.mjs';
import {uuid} from './safety.mjs';

// Never overwrite or remove history. A new version requires a new code review.
export function continuationGuard(j,io=fs){
 const file=j.entry.file, old=file+'.storage-resume.started', next=file+'.storage-remaining-v1.started';
 const digest=p=>{const stat=io.lstatSync(p);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw Error();return createHash('sha256').update(io.readFileSync(p)).digest('hex');};
 const snapshot=()=>{
  const names=io.readdirSync(path.dirname(file));
  if(names.some(n=>n.startsWith(path.basename(file)+'.') && n!==path.basename(old)))throw Error();
  return {journal:digest(file),previous:io.existsSync(old)?digest(old):null};
 };
 const before=snapshot();
 return ()=>{const now=snapshot();if(JSON.stringify(now)!==JSON.stringify(before))throw Error();
  io.writeFileSync(next,JSON.stringify({version:1,scope:'remaining-storage-only',project:j.header.project,run:j.header.run,history:before})+'\n',{flag:'wx',mode:0o600});};
}
const denied=r=>!r.ok && [400,403,404].includes(r.status) && ['AccessDenied','unauthorized','Unauthorized'].includes(r.data?.code ?? r.data?.error);
const missing=r=>!r.ok && [400,404].includes(r.status) && ['NoSuchKey','not_found'].includes(r.data?.code ?? r.data?.error);
export async function remainingStorage({j,main,until,users,backend,op,require,save,claim}){
 const a=users.ASSISTANT_A.api,doctor=users.DOCTOR.api,f=j.records;
 const root='/storage/v1/object/',object='carebridge-private/'+main.id;
 require(!main.retained_by && !main.retained_at && !main.retention_reason,'incompatible_state');
 const absent=(step,id)=>op(step,backend,root+'authenticated/carebridge-private/'+id,'GET',undefined,{},false,r=>require(missing(r),'incompatible_state'));
 const unchanged=()=>op('retention_unchanged',doctor,'/rest/v1/patient_uploads?id=eq.'+main.id,'GET',undefined,{},false,r=>require(r.ok&&r.data?.length===1&&r.data[0].id===main.id&&r.data[0].expires_at===main.expires_at&&!r.data[0].retained_by&&!r.data[0].retained_at&&!r.data[0].retention_reason&&r.data[0].state==='available','incompatible_state'));
 await op('list_denial',a,root+'list/carebridge-private','POST',{prefix:main.id,limit:100},{},false,r=>require(denied(r)||(r.ok&&Array.isArray(r.data)&&r.data.length===0),'unexpected_result'));
 // Sign and negative mutation requests may have effects if protections are broken.
 await claim();
 await op('sign_denial',a,root+'sign/'+object,'POST',{expiresIn:60},{},false,r=>require(denied(r),'unexpected_http'));
 for(const [step,method,extra] of [['overwrite_denial','PUT',{}],['upsert_denial','POST',{'x-upsert':'true'}]])
  await op(step,a,root+object,method,png,{'Content-Type':'image/png',...extra},true,r=>require(denied(r),'unexpected_http'));
 const register=async(step,name)=>{const r=await op(step,a,'/rest/v1/rpc/register_upload','POST',{p_appointment:main.appointment_id,p_category:'payment_evidence',p_name:name,p_type:'image/png',p_size:png.length},{},false,r=>{require(r.ok,'unexpected_http');uuid(r.data);require(!Object.values(f).flat().includes(r.data),'incompatible_state');});await save(r.data);return r.data;};
 const move=f.patient_uploads[1]??await register('move_register','synthetic-move-target.png');
 await absent('move_target_before',move);
 await op('move_denial',a,root+'move','POST',{bucketId:'carebridge-private',sourceKey:main.id,destinationKey:move},{},false,r=>require(denied(r),'unexpected_http'));
 await absent('move_target_after',move);
 await op('bytes_preserved',doctor,root+'authenticated/'+object,'GET',undefined,{},false,r=>require(r.ok&&r.bytes.equals(png),'incompatible_state'));
 const bad=f.patient_uploads[2]??await register('limits_register','synthetic-oversize.png');
 await absent('limits_before',bad);
 await op('size_denial',a,root+'carebridge-private/'+bad,'POST',Buffer.alloc(2097153),{'Content-Type':'image/png'},true,r=>require(!r.ok&&[400,413].includes(r.status)&&(r.status===413||r.data?.code==='EntityTooLarge'),'unexpected_http'));
 await absent('limits_after_size',bad);
 await op('mime_denial',a,root+'carebridge-private/'+bad,'POST',Buffer.from('synthetic only'),{'Content-Type':'text/plain'},true,r=>require(!r.ok&&[400,415].includes(r.status)&&(r.status===415||r.data?.code==='InvalidMimeType'),'unexpected_http'));
 await absent('limits_after_mime',bad);
 const retention='/rest/v1/rpc/keep_upload_longer';
 await op('assistant_retention_denial',a,retention,'POST',{p_upload:main.id,p_until:until.toISOString(),p_reason:'payment_dispute'},{},false,r=>require(!r.ok&&[400,403].includes(r.status)&&r.data?.code==='42501','unexpected_http'));
 await unchanged();
 for(const [step,value] of [['retention_same_denial',main.expires_at],['retention_cap_denial',new Date(Date.parse(main.uploaded_at)+91*86400000).toISOString()]]){
  await op(step,doctor,retention,'POST',{p_upload:main.id,p_until:value,p_reason:'payment_dispute'},{},false,r=>require(!r.ok&&r.status===400&&r.data?.code==='P0001'&&r.data?.message==='Cannot extend expired/deleting upload or exceed 90 days','unexpected_http'));
  await unchanged();
 }
 await op('doctor_retention',doctor,retention,'POST',{p_upload:main.id,p_until:until.toISOString(),p_reason:'payment_dispute'});
 await op('retention_verify',doctor,'/rest/v1/patient_uploads?id=eq.'+main.id,'GET',undefined,{},false,r=>require(r.ok&&r.data?.length===1&&r.data[0].id===main.id&&Date.parse(r.data[0].expires_at)===until.getTime()&&r.data[0].retained_by===users.DOCTOR.id&&Number.isFinite(Date.parse(r.data[0].retained_at))&&r.data[0].retention_reason==='payment_dispute'&&r.data[0].state==='available','incompatible_state'));
}
