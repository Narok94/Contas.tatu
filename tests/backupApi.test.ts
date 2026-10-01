import assert from 'node:assert/strict';
import {test} from 'node:test';
import {backupHandler,BACKUP_UNAVAILABLE} from '../server/backup/api.js';
import {BACKUP_TARGET,createNeonBackupService} from '../server/backup/neonBackup.js';
import {cookieName} from '../server/auth/access.js';
import {createBackupApi,BackupApiError} from '../src/services/backupApi.js';

const secret='synthetic-admin-secret';
function fixture(configured=true,failure=false){
 const calls:{url:string;method:string}[]=[];
 const env=configured?{CONTAS_TATU_NEON_API_KEY:secret,CONTAS_TATU_NEON_PROJECT_ID:BACKUP_TARGET.projectId,CONTAS_TATU_NEON_BRANCH_ID:BACKUP_TARGET.branchId}:{};
 const snapshot={id:'snap-test',name:'safe',source_branch_id:BACKUP_TARGET.branchId,created_at:'2026-10-01T12:00:00Z',expires_at:null,connection_uri:secret};
 const fetcher=(async(url,init)=>{
  calls.push({url:String(url),method:init?.method??'GET'});
  if(failure)return new Response(secret,{status:403});
  const path=new URL(String(url)).pathname;
  if(path.endsWith('/snapshot')){assert.match(new URL(String(url)).searchParams.get('name')!,/^ponto-seguro-/);return Response.json({snapshot,operations:[{id:'op-test',status:'running'}]});}
  if(path.endsWith('/snapshots'))return Response.json({snapshots:[snapshot]});
  if(path.endsWith('/operations/op-test'))return Response.json({operation:{id:'op-test',project_id:BACKUP_TARGET.projectId,status:'finished',secret}});
  return Response.json({branch:{id:BACKUP_TARGET.branchId,project_id:BACKUP_TARGET.projectId,name:'main'}});
 }) as typeof fetch;
 const auth={session:async(token:string)=>token==='valid'?{user:{id:'test-user'}}:undefined} as any;
 const handler=backupHandler(createNeonBackupService({env,fetcher}),auth);
 async function request(method='GET',query={},body:unknown={},logged=true,cross=false){
  let result:any;const headers:Record<string,string>={};
  const req={method,query,body,headers:{host:'localhost:3104',origin:'http://localhost:3104','content-type':'application/json',cookie:`${cookieName()}=${logged?'valid':'invalid'}`,'sec-fetch-site':cross?'cross-site':'same-origin'},socket:{remoteAddress:'127.0.0.1'}} as any;
  const res={statusCode:0,setHeader:(key:string,value:string)=>headers[key]=value,end:(value:string)=>result=JSON.parse(value)} as any;
  await handler(req,res);return {status:res.statusCode,body:result,headers};
 }
 return {calls,request};
}
test('authenticated creation/listing reuse native snapshots and operation status',async()=>{
 const f=fixture();assert.deepEqual((await f.request('GET',{view:'status'})).body,{available:true});assert.equal(f.calls.length,0);
 const created=await f.request('POST');assert.equal(created.status,202);assert.equal(created.body.snapshot.id,'snap-test');
 assert.equal((await f.request()).body.snapshots.length,1);
 assert.deepEqual((await f.request('GET',{operation:'op-test'})).body,{id:'op-test',status:'finished'});
 assert.ok(!JSON.stringify(created).includes(secret));assert.equal(created.headers['Cache-Control'],'no-store');
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.ok(f.calls.every(c=>!c.url.includes('restore')));
});
test('missing configuration blocks writes/listing with sanitized messages and no network',async()=>{
 const f=fixture(false);assert.deepEqual((await f.request('GET',{view:'status'})).body,{available:false,message:BACKUP_UNAVAILABLE});
 for(const method of ['GET','POST']){const response=await f.request(method);assert.equal(response.status,503);assert.equal(response.body.code,'BACKUP_NOT_CONFIGURED');assert.equal(response.body.error,BACKUP_UNAVAILABLE);}
 assert.equal(f.calls.length,0);
});
test('unauthenticated, cross-origin and restoration requests never reach Neon',async()=>{
 const f=fixture();assert.equal((await f.request('POST',{}, {},false)).status,401);assert.equal((await f.request('POST',{}, {},true,true)).status,401);
 assert.equal((await f.request('POST',{}, {restore:'snap-test',confirmation:'yes'})).status,400);
 assert.equal((await f.request('GET',{restore:'snap-test'})).status,400);assert.equal((await f.request('DELETE')).status,405);assert.equal(f.calls.length,0);
});
test('upstream failures are sanitized and writes are never retried',async()=>{
 const f=fixture(true,true);const response=await f.request('POST');assert.equal(response.status,503);assert.equal(response.body.code,'BACKUP_FAILED');assert.ok(!JSON.stringify(response).includes(secret));assert.equal(f.calls.length,1);
});
test('frontend sanitizes missing-key and upstream errors without retry',async()=>{
 for(const code of ['BACKUP_NOT_CONFIGURED','BACKUP_FAILED']){
  let calls=0;const api=createBackupApi((async(_url,init)=>{calls++;assert.equal(init?.body,'{}');assert.equal(init?.credentials,'same-origin');return Response.json({code,error:secret},{status:503});}) as typeof fetch);
  await assert.rejects(api.create(),(error:BackupApiError)=>error instanceof BackupApiError && error.unconfigured===(code==='BACKUP_NOT_CONFIGURED') && !error.message.includes(secret));assert.equal(calls,1);
 }
});
