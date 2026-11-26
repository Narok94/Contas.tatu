import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createFoundation } from '../server/foundation.js';
import { provisionUsers } from '../server/auth/provision.js';
import { createAuthService } from '../server/auth/service.js';
import { createSevenService, validateExpense } from '../server/seven/service.js';
import { sevenHandler } from '../server/seven/api.js';
import { createFinanceService } from '../server/finance/service.js';
import { createRepository, type Transport } from '../server/finance/repository.js';
import { canAccessSeven, type SevenExpense } from '../src/seven/model.js';
import { monthlyReport } from '../src/seven/report.js';

const image={name:'print.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII='};
test('Seven persists private receipts without modifying household finance',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  for(const migration of ['001_finance_v2','002_closed_auth','003_household_chat','004_mobile_payments','005_entry_origins','006_seven_receipts'])await pg.exec(readFileSync(`database/migrations/${migration}.sql`,'utf8'));
  await pg.exec(readFileSync('database/migrations/006_seven_receipts.sql','utf8'));
  const db:Transport={batch:(qs,ro)=>pg.transaction(async tx=>{if(ro)await tx.exec('SET TRANSACTION READ ONLY');const rows=[];for(const s of qs)rows.push((await tx.query<Record<string,unknown>>(s.text,s.values)).rows);return rows;})};
  await createFoundation({transaction:(qs,ro=false)=>db.batch(qs,ro)}).initialize();
  const password=randomBytes(20).toString('base64url');await provisionUsers(db,password);
  const auth=createAuthService(db),seven=createSevenService(db),finance=createFinanceService(createRepository(db));
  const h=await auth.login({login:'Henrique',password,remember:true},'h');
  const j=await auth.login({login:'Jessica',password,remember:true},'j');
  async function invoke(token:string,method:string,body?:unknown,query:Record<string,string>={},origin='http://localhost:3100') {
    let status=0,result:any;
    const req:any={method,body,query,headers:{'content-type':'application/json',cookie:`contas_tatu_session=${token}`,origin,host:'localhost:3100'},socket:{remoteAddress:'127.0.0.1'}};
    const res:any={setHeader(){},set statusCode(v:number){status=v;},end(v:string){result=JSON.parse(v);}};
    await sevenHandler(seven,auth)(req,res);return {status,result};
  }
  const draft:SevenExpense={id:randomUUID(),description:'Uber',location:'Cliente X',date:'2026-11-26',cents:2750,notes:'',accountId:null,images:[image,{...image,name:'print-2.png'}],version:0};
  const before=await createRepository(db).load();
  await t.test('authenticated stable ID restriction covers every method and forged display names',async()=>{
    assert.equal(canAccessSeven(j.user),false);assert.equal(canAccessSeven(h.user),true);
    for(const method of ['GET','POST','DELETE']) {
      assert.equal((await invoke('',method,draft)).status,401);
      assert.equal((await invoke(j.token,method,draft)).status,403);
    }
    await assert.rejects(seven.read({...j.user,name:'Henrique'},{month:'2026-11'}),{status:403});
    await assert.rejects(seven.read({...h.user,householdId:randomUUID()},{month:'2026-11'}),{status:403});
    assert.equal((await invoke(h.token,'POST',draft,{},'https://evil.example')).status,401);
    assert.equal((await invoke(h.token,'GET',undefined,{month:'2026-11',ownerId:j.user.id})).status,400);
  });
  await t.test('create, upload and read two prints; reject retries and natural duplicates',async()=>{
    assert.equal((await invoke(h.token,'POST',draft)).status,200);
    assert.equal((await invoke(h.token,'POST',draft)).status,409);
    assert.equal((await invoke(h.token,'POST',{...draft,id:randomUUID()})).status,409);
    const detail=await invoke(h.token,'GET',undefined,{id:draft.id});
    assert.deepEqual(detail.result.images,draft.images);assert.equal(detail.result.version,1);
    assert.deepEqual(await createRepository(db).load(),before);
  });
  await t.test('monthly filter and integer-cent totals exclude other months and summaries omit image payloads',async()=>{
    await seven.save(h.user,{...draft,id:randomUUID(),description:'Almoço',cents:1010});
    await seven.save(h.user,{...draft,id:randomUUID(),date:'2026-10-31',cents:999});
    const month=await seven.read(h.user,{month:'2026-11'}) as any;
    assert.equal(month.expenses.length,2);assert.equal(month.totalCents,3760);assert.equal(month.expenses[0].imageCount,2);assert.equal(month.expenses[0].images,undefined);
    assert.equal((await invoke(h.token,'GET',undefined,{month:'2026-10'})).result.totalCents,999);
    assert.equal((await invoke(h.token,'GET',undefined,{month:'2026-12'})).result.totalCents,0);
  });
  await t.test('edit replaces prints, persists after reconnect and rejects stale updates/deletes',async()=>{
    assert.equal((await invoke(h.token,'POST',{...draft,version:1,cents:3000,images:[image]})).status,200);
    assert.equal((await invoke(h.token,'POST',{...draft,version:1})).status,409);
    assert.equal((await invoke(h.token,'DELETE',{id:draft.id,version:1})).status,409);
    const detail=await createSevenService(db).read(h.user,{id:draft.id});
    assert.equal(detail.cents,3000);assert.equal((detail.images as unknown[]).length,1);
  });
  await t.test('validates dates, amounts, required fields, image signatures, formats and size',async()=>{
    for(const change of [{date:'2026-02-30'},{cents:0},{cents:1.5},{description:''},{images:[]},{images:[{name:'evil.svg',data:'data:image/svg+xml;base64,PHN2Zz4='}]},{images:[{...image,data:'data:image/png;base64,YWJj'}]},{images:Array(11).fill(image)},{ownerId:j.user.id},{images:[{...image,data:image.data+'A'.repeat(3300000)}]}])
      assert.throws(()=>validateExpense({...draft,...change}));
    assert.equal((await invoke(h.token,'POST',{...draft,notes:'x'.repeat(3300000)})).status,413);
    assert.equal((await invoke(h.token,'GET',undefined,{month:'2026-13'})).status,400);
  });
  await t.test('existing-account link creates no financial entry and cannot be reused',async()=>{
    const view=await finance.read('2026-11');
    await finance.execute({action:'simple.create',month:'2026-11',expectedRevision:view.revision,data:{name:'Táxi existente',value:40,categoryId:view.state.categories[0].id}},h.user.id);
    const financial=await createRepository(db).load();
    const accountId=financial.store.simpleAccounts[0].id;
    const linked={...draft,id:randomUUID(),description:'Táxi',accountId,cents:4000};
    assert.equal((await invoke(h.token,'POST',linked)).status,200);
    assert.equal((await invoke(h.token,'POST',{...linked,id:randomUUID(),description:'Outro'})).status,409);
    assert.equal((await invoke(h.token,'POST',{...linked,id:randomUUID(),accountId:randomUUID()})).status,409);
    assert.deepEqual(await createRepository(db).load(),financial);
    assert.equal((await invoke(h.token,'DELETE',{id:linked.id,version:1})).status,200);
    assert.deepEqual(await createRepository(db).load(),financial);
  });
  await t.test('report embeds linked prints, exact total and escapes user content',()=>{
    const html=monthlyReport('2026-11',[{...draft,description:'<script>alert(1)</script>'},{...draft,cents:1010}]);
    assert.ok(html.includes('37,60'));assert.ok(html.includes('26/11/2026'));assert.ok(html.includes('Cliente X'));
    assert.ok(html.includes(image.data));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
  });
  await t.test('delete removes the expense and its embedded prints',async()=>{
    assert.equal((await invoke(h.token,'DELETE',{id:draft.id,version:2})).status,200);
    assert.equal((await invoke(h.token,'GET',undefined,{id:draft.id})).status,404);
    assert.equal((await invoke(h.token,'GET',undefined,{month:'2026-11'})).result.totalCents,1010);
  });
});
