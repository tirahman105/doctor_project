import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {remainingStorage,continuationGuard} from '../scripts/hosted-acceptance/storage-remaining.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture({reuse=false,fail='',retained=false}={}){
 const main={id:id(1),appointment_id:id(2),uploaded_at:new Date().toISOString(),expires_at:new Date(Date.now()+7*86400000).toISOString(),state:'available',retained_by:retained?id(3):null};
 const records={patient_uploads:reuse?[id(1),id(4),id(5)]:[id(1)]};
 const calls=[],saves=[];let claimed=false,count=4;
 const check=(v)=>{if(!v)throw Error('SANITIZED');};
 const users={DOCTOR:{id:id(3),api:'doctor'},ASSISTANT_A:{api:'assistant'}};
 const op=async(step,api,p,method='GET',body,headers,binary,validate=r=>check(r.ok))=>{
  calls.push({step,method,api});if(!['GET'].includes(method)&&step!=='list_denial')assert.ok(claimed);
  let r={ok:false,status:403,data:{code:'AccessDenied'}};
  if(step===fail)r={ok:false,status:400,data:{code:'Unknown',message:'PRIVATE SECRET'}};
  else if(step.includes('target_')||step.startsWith('limits_')&&step!=='limits_register')r={ok:false,status:404,data:{code:'NoSuchKey'}};
  else if(step.endsWith('_register'))r={ok:true,status:200,data:id(count++)};
  else if(step==='bytes_preserved')r={ok:true,status:200,bytes:{equals:()=>true}};
  else if(step==='size_denial')r={ok:false,status:413};
  else if(step==='mime_denial')r={ok:false,status:415};
  else if(step==='assistant_retention_denial')r={ok:false,status:403,data:{code:'42501'}};
  else if(['retention_same_denial','retention_cap_denial'].includes(step))r={ok:false,status:400,data:{code:'P0001',message:'Cannot extend expired/deleting upload or exceed 90 days'}};
  else if(step==='doctor_retention'){Object.assign(main,{expires_at:body.p_until,retained_by:users.DOCTOR.id,retained_at:new Date().toISOString(),retention_reason:'payment_dispute'});r={ok:true,status:204};}
  else if(step==='retention_unchanged'||step==='retention_verify')r={ok:true,status:200,data:[{...main}]};
  validate(r);return r;
 };
 return {calls,saves,context:{j:{records},main,until:new Date(Date.now()+14*86400000),users,backend:'backend',op,require:check,save:async v=>saves.push(v),claim:async()=>{claimed=true;}}};
}
test('remaining groups reuse existing auxiliaries or register only missing metadata; no deletes or prior fixture groups',async()=>{
 for(const reuse of [false,true]){const m=fixture({reuse});await remainingStorage(m.context);assert.equal(m.saves.length,reuse?0:2);assert.equal(m.calls.at(-1).step,'retention_verify');assert.ok(!m.calls.some(c=>c.method==='DELETE'||/anonymous|public_denial|complete|upload$/.test(c.step)));assert.ok(m.calls.some(c=>c.step==='move_target_after'));assert.ok(m.calls.some(c=>c.step==='limits_after_mime'));assert.equal(m.calls.filter(c=>c.step==='retention_unchanged').length,3);}
});
test('every unknown response stops remaining groups immediately',async()=>{
 const success=fixture();await remainingStorage(success.context);
 for(const step of new Set(success.calls.map(c=>c.step))){const m=fixture({fail:step});await assert.rejects(remainingStorage(m.context));assert.equal(m.calls.at(-1).step,step);}
});
test('retained state stops before all remaining operations; marker failure stops before signing',async()=>{
 const m=fixture({retained:true});await assert.rejects(remainingStorage(m.context));assert.equal(m.calls.length,0);
 const n=fixture();n.context.claim=()=>{throw Error();};await assert.rejects(remainingStorage(n.context));assert.deepEqual(n.calls.map(c=>c.step),['list_denial']);
});
function markerMock(old=true){
 const file=path.join('ignored','fixture.jsonl'),files=new Map([[file,'journal']]);if(old)files.set(file+'.storage-resume.started','preserved history');
 const io={lstatSync:p=>{if(!files.has(p))throw Error();return {isFile:()=>true,isSymbolicLink:()=>false,size:files.get(p).length};},readFileSync:p=>files.get(p),existsSync:p=>files.has(p),readdirSync:()=>[...files.keys()].map(p=>path.basename(p)),writeFileSync:(p,v,o)=>{assert.equal(o.flag,'wx');assert.ok(!files.has(p));files.set(p,v);}};
 return {files,io,file,j:{entry:{file},header:{project:'a'.repeat(20),run:id(8)}}};
}
test('continuation marker preserves previous history, is exclusive, and binds unchanged journal',()=>{
 for(const old of [false,true]){const m=markerMock(old);const claim=continuationGuard(m.j,m.io);claim();if(old)assert.equal(m.files.get(m.file+'.storage-resume.started'),'preserved history');assert.throws(claim);assert.throws(()=>continuationGuard(m.j,m.io));}
 const m=markerMock();const claim=continuationGuard(m.j,m.io);m.files.set(m.file,'changed');assert.throws(claim);assert.equal(m.files.size,2);
 const n=markerMock();n.files.set(n.file+'.unknown','unknown');assert.throws(()=>continuationGuard(n.j,n.io));
});
