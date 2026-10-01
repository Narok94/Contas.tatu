import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_TARGET,createNeonBackupService } from '../server/backup/neonBackup.js';

function fixture() {
  const env={CONTAS_TATU_NEON_API_KEY:'synthetic-private-token',CONTAS_TATU_NEON_PROJECT_ID:BACKUP_TARGET.projectId,CONTAS_TATU_NEON_BRANCH_ID:BACKUP_TARGET.branchId};
  let clock=Date.parse('2026-10-01T12:00:00Z');
  let snapshots:any[]=[{id:'snap-good',name:'ponto-seguro',source_branch_id:BACKUP_TARGET.branchId,created_at:'2026-10-01T11:00:00Z',timestamp:'2026-10-01T11:00:00Z',expires_at:null}];
  let branches:any[]=[{id:BACKUP_TARGET.branchId,project_id:BACKUP_TARGET.projectId,name:'main'}];
  const calls:{path:string;method:string;body:any}[]=[];
  let failure:'timeout'|'timeout-write'|'http'|'malformed'|undefined;
  const fetcher=(async(url,init)=>{
    assert.equal(init?.redirect,'error');assert.ok(init?.signal);
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer synthetic-private-token');
    const path=new URL(String(url)).pathname.replace('/api/v2',''),method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):undefined;
    calls.push({path,method,body});
    if(failure==='timeout' || failure==='timeout-write' && method==='POST')throw new Error('password connection token stack');
    if(failure==='http')return new Response('synthetic-private-token postgres://private',{status:403});
    if(failure==='malformed')return new Response('not-json');
    const prefix=`/projects/${BACKUP_TARGET.projectId}`;
    if(method==='GET' && path===`${prefix}/branches/${BACKUP_TARGET.branchId}`)return Response.json({branch:branches[0]});
    if(method==='GET' && path===`${prefix}/branches`)return Response.json({branches});
    if(method==='GET' && path===`${prefix}/snapshots`)return Response.json({snapshots});
    if(method==='POST' && path===`${prefix}/branches/${BACKUP_TARGET.branchId}/snapshot`){
      assert.equal(new URL(String(url)).searchParams.get('name'),'antes-da-alteracao');
      assert.equal(new URL(String(url)).searchParams.has('expires_at'),false);
      return Response.json({snapshot:snapshots[0],operations:[{id:'operation-create',status:'running'}]});
    }
    if(method==='GET' && path===`${prefix}/operations/operation-create`)return Response.json({operation:{id:'operation-create',project_id:BACKUP_TARGET.projectId,status:'finished',secret:'must-not-leak'}});
    if(method==='POST' && path===`${prefix}/snapshots/snap-good/restore`){
      assert.deepEqual(body,{name:'recovery-conferencia',target_branch_id:BACKUP_TARGET.branchId,finalize_restore:false});
      return Response.json({branch:{id:'br-recovered',project_id:BACKUP_TARGET.projectId,name:body.name},operations:[{id:'operation-restore',status:'running'}],connection_uris:['postgres://secret']});
    }
    throw new Error(`Unexpected request ${method} ${path}`);
  }) as typeof fetch;
  const service=createNeonBackupService({env,fetcher,now:()=>clock});
  return {service,env,calls,snapshots,branches,setTime:(time:number)=>clock=time,setFailure:(v:typeof failure)=>failure=v};
}

test('configuration is lazy and missing/wrong targets never contact Neon',async()=>{
  let calls=0;const fetcher=(async()=>{calls++;throw new Error('Network forbidden');}) as typeof fetch;
  const service=createNeonBackupService({env:{},fetcher});assert.equal(calls,0);
  await assert.rejects(service.list(),{code:'CONFIGURATION'});assert.equal(calls,0);
  const f=fixture();f.env.CONTAS_TATU_NEON_PROJECT_ID='other';await assert.rejects(f.service.create('safe'),{code:'CONFIGURATION'});assert.equal(f.calls.length,0);
});
test('list/create use native full-branch snapshots, sanitize output and preserve expiry',async()=>{
  const f=fixture();f.snapshots.push({...f.snapshots[0],id:'snap-other',source_branch_id:'br-other'});
  assert.equal((await f.service.list()).length,1);
  const created=await f.service.create('antes-da-alteracao');assert.equal(created.snapshot.sourceBranchId,BACKUP_TARGET.branchId);assert.equal(created.operations[0].status,'running');
  assert.deepEqual(await f.service.operation('operation-create'),{id:'operation-create',status:'finished'});
  assert.ok(!JSON.stringify(created).includes('synthetic-private-token'));
  assert.ok(f.calls.every(c=>c.method==='GET' || c.method==='POST' && c.path.endsWith('/snapshot')));
});
test('preparation performs reads only and exact confirmation restores a separate branch',async()=>{
  const f=fixture(),plan=await f.service.prepareRestore('snap-good','recovery-conferencia');
  assert.ok(f.calls.every(c=>c.method==='GET'));
  await assert.rejects(f.service.restore(plan.id,''),{code:'CONFIRMATION_REQUIRED'});
  await assert.rejects(f.service.restore(plan.id,'yes'),{code:'CONFIRMATION_REQUIRED'});
  assert.ok(f.calls.every(c=>c.method==='GET'));
  const result=await f.service.restore(plan.id,plan.confirmation);
  assert.equal(result.branch.id,'br-recovered');assert.notEqual(result.branch.id,BACKUP_TARGET.branchId);
  assert.ok(!JSON.stringify(result).includes('postgres://'));
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  await assert.rejects(f.service.restore(plan.id,plan.confirmation),{code:'CONFIRMATION_REQUIRED'});
});
test('expired, forged and mutated confirmation plans cannot restore',async()=>{
  const f=fixture();await assert.rejects(f.service.restore('forged','anything'),{code:'CONFIRMATION_REQUIRED'});
  const plan=await f.service.prepareRestore('snap-good','recovery-conferencia');
  plan.confirmation='FORGED';plan.recoveryBranchName='main';
  await assert.rejects(f.service.restore(plan.id,plan.confirmation),{code:'CONFIRMATION_REQUIRED'});
  f.setTime(Date.parse(plan.expiresAt));
  await assert.rejects(f.service.restore(plan.id,'RESTAURAR snap-good EM recovery-conferencia'),{code:'CONFIRMATION_REQUIRED'});
  assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('another branch, expired snapshots, missing snapshots and existing destinations fail closed',async()=>{
  const f=fixture();
  await assert.rejects(f.service.prepareRestore('snap-good','main'),{code:'INVALID_NAME'});
  await assert.rejects(f.service.prepareRestore('../injection','recovery-conferencia'),{code:'INVALID_ID'});
  f.snapshots[0].source_branch_id='br-other';await assert.rejects(f.service.prepareRestore('snap-good','recovery-conferencia'),{code:'UNAVAILABLE_SNAPSHOT'});
  f.snapshots[0].source_branch_id=BACKUP_TARGET.branchId;f.snapshots[0].expires_at='2026-10-01T10:00:00Z';
  await assert.rejects(f.service.prepareRestore('snap-good','recovery-conferencia'),{code:'UNAVAILABLE_SNAPSHOT'});
  f.snapshots[0].expires_at=null;f.branches.push({id:'br-existing',name:'recovery-conferencia'});
  await assert.rejects(f.service.prepareRestore('snap-good','recovery-conferencia'),{code:'BRANCH_EXISTS'});
  assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('snapshot and branch are revalidated after confirmation; no restore on changed state',async()=>{
  const f=fixture(),plan=await f.service.prepareRestore('snap-good','recovery-conferencia');
  f.snapshots.length=0;await assert.rejects(f.service.restore(plan.id,plan.confirmation),{code:'UNAVAILABLE_SNAPSHOT'});
  assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
  const g=fixture(),p=await g.service.prepareRestore('snap-good','recovery-conferencia');g.branches[0].name='unexpected';
  await assert.rejects(g.service.restore(p.id,p.confirmation),{code:'TARGET_MISMATCH'});
  assert.equal(g.calls.filter(c=>c.method==='POST').length,0);
});
test('simultaneous confirmations consume a plan once',async()=>{
  const f=fixture(),p=await f.service.prepareRestore('snap-good','recovery-conferencia');
  const result=await Promise.allSettled([f.service.restore(p.id,p.confirmation),f.service.restore(p.id,p.confirmation)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('errors are sanitized; uncertain writes are not retried',async()=>{
  for(const failure of ['timeout','http','malformed'] as const){
    const f=fixture();f.setFailure(failure);
    await assert.rejects(f.service.create('antes-da-alteracao'),(error:Error)=>!error.message.includes('synthetic-private-token') && !error.message.includes('postgres://'));
    assert.equal(f.calls.length,1);
  }
  const f=fixture(),p=await f.service.prepareRestore('snap-good','recovery-conferencia');
  f.setFailure('timeout-write');await assert.rejects(f.service.restore(p.id,p.confirmation),{code:'UNKNOWN_OUTCOME'});
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  await assert.rejects(f.service.restore(p.id,p.confirmation),{code:'CONFIRMATION_REQUIRED'});
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
