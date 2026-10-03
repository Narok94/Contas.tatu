import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createFoundation } from '../server/foundation.js';
import { provisionUsers } from '../server/auth/provision.js';
import { createAuthService } from '../server/auth/service.js';
import { createChatService } from '../server/chat/service.js';
import { chatHandler } from '../server/chat/api.js';
import { createFinanceService } from '../server/finance/service.js';
import { createRepository, q, type Transport } from '../server/finance/repository.js';
import { choosePreviewCard } from '../src/mobile/conversation.js';

test('persistent household chat with both authenticated users and atomic financial confirmation',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  for(const migration of ['001_finance_v2','002_closed_auth','003_household_chat'])await pg.exec(readFileSync(`database/migrations/${migration}.sql`,'utf8'));
  const db:Transport={batch:(qs,ro)=>pg.transaction(async tx=>{if(ro)await tx.exec('SET TRANSACTION READ ONLY');const rows=[];for(const s of qs)rows.push((await tx.query(s.text,s.values)).rows);return rows as any;})};
  await createFoundation({transaction:(qs,ro=false)=>db.batch(qs,ro)}).initialize();
  const password=randomBytes(20).toString('base64url');await provisionUsers(db,password);
  const auth=createAuthService(db),chat=createChatService(db),finance=createFinanceService(createRepository(db));
  let h=await auth.login({login:'Henrique',password,remember:true},'h');
  const j=await auth.login({login:'Jessica',password,remember:true},'j');
  async function invoke(token:string,method:string,body?:unknown,query:Record<string,string>={},confirm=false) {
    let status=0,result:any;
    const req:any={method,body,query,headers:{'content-type':'application/json',cookie:`contas_tatu_session=${token}`,origin:'http://localhost:3100',host:'localhost:3100'},socket:{remoteAddress:'127.0.0.1'}};
    const res:any={setHeader(){},set statusCode(v:number){status=v;},end(v:string){result=v?JSON.parse(v):undefined;}};
    await chatHandler(confirm,chat,auth)(req,res);return {status,result};
  }
  const hId=randomUUID(),jId=randomUUID();let previewId='';
  await t.test('Henrique and Jessica share content, immutable authors and server timestamps',async()=>{
    assert.equal((await invoke('', 'GET')).status,401);
    assert.equal((await invoke(h.token,'POST',{id:hId,text:'Mercado 123,45',month:'2026-10',authorId:j.user.id})).status,400);
    assert.equal((await invoke(h.token,'POST',{id:hId,text:'Mercado 123,45',month:'2026-10'})).status,200);
    assert.equal((await invoke(j.token,'POST',{id:jId,text:'Luz 87,90 paga',month:'2026-10'})).status,200);
    const first=await invoke(h.token,'GET'),second=await invoke(j.token,'GET');
    assert.deepEqual(first.result,second.result);assert.equal(first.result.messages.length,4);
    const hm=first.result.messages.find((m:any)=>m.id===hId),jm=first.result.messages.find((m:any)=>m.id===jId);
    assert.equal(hm.authorId,h.user.id);assert.equal(jm.authorId,j.user.id);assert.equal(jm.authorName,'Jéssica');assert.ok(!Number.isNaN(Date.parse(hm.createdAt)));
    previewId=first.result.messages[1].id;
    await invoke(h.token,'POST',{id:hId,text:'Mercado 123,45',month:'2026-10'});
    assert.equal((await invoke(j.token,'GET')).result.messages.length,4);
    assert.equal((await invoke(j.token,'POST',{id:hId,text:'Texto alterado',month:'2026-10'})).status,409);
  });
  await t.test('logout, relogin and a new service retain the same history',async()=>{
    const before=(await invoke(j.token,'GET')).result.messages;
    await auth.logout(h.token);assert.equal((await invoke(h.token,'GET')).status,401);
    h=await auth.login({login:'Henrique',password,remember:true},'h-again');
    assert.deepEqual(JSON.parse(JSON.stringify((await createChatService(db).list(h.user)).messages)),before);
  });
  await t.test('confirmation and its receipt commit together, retries and two users cannot duplicate',async()=>{
    const before=await finance.read('2026-10');
    assert.equal((await invoke(j.token,'POST',{id:previewId,expectedRevision:'999999'}, {},true)).status,409);
    assert.equal((await finance.read('2026-10')).state.simpleAccounts.length,0);
    assert.equal((await invoke(j.token,'POST',{id:previewId,expectedRevision:before.revision}, {},true)).status,200);
    assert.equal((await invoke(h.token,'POST',{id:previewId,expectedRevision:before.revision}, {},true)).status,200);
    const state=await finance.read('2026-10');assert.equal(state.state.simpleAccounts.length,1);assert.equal(state.state.simpleAccounts[0].value,123.45);
    const messages=(await chat.list(h.user)).messages;
    const preview=messages.find(m=>m.id===previewId)!;assert.equal(preview.saved,true);assert.ok(preview.linkedFinancialOperationId);
    const receipt=messages.find(m=>m.id===preview.linkedFinancialOperationId)!;
    assert.equal(receipt.interactionAuthor?.id,j.user.id);assert.equal(receipt.preview?.name,'Mercado');
    assert.equal(preview.interactionAuthor?.id,h.user.id);
  });
  await t.test('corrections are stored, rejected commands leave no saved receipt',async()=>{
    const result=await chat.send(j.user,{id:randomUUID(),text:'Luz 50',month:'2026-10'});const draft=result.messages[1];
    let state=await finance.read('2026-10');
    await assert.rejects(chat.confirm(j.user,{id:draft.id,expectedRevision:state.revision,preview:{...draft.preview,categoryId:randomUUID()}}));
    assert.equal((await chat.list(h.user)).messages.find(m=>m.id===draft.id)?.saved,false);
    await chat.confirm(j.user,{id:draft.id,expectedRevision:state.revision,preview:{...draft.preview,name:'Luz corrigida',amount:62.30,paid:true}});
    state=await finance.read('2026-10');assert.equal(state.state.simpleAccounts.find(a=>a.name==='Luz corrigida')?.value,62.30);
    assert.equal((await chat.list(h.user)).messages.find(m=>m.id===draft.id)?.preview?.name,'Luz corrigida');
    assert.equal((await chat.list(h.user)).messages.find(m=>m.id===draft.id)?.originalPreview?.name,'Conta de luz');
  });
  await t.test('simultaneous confirmations by both users create one financial entry',async()=>{
    const draft=(await chat.send(h.user,{id:randomUUID(),text:'Internet 40',month:'2026-10'})).messages[1];
    const before=await finance.read('2026-10');
    const results=await Promise.allSettled([chat.confirm(h.user,{id:draft.id,expectedRevision:before.revision}),chat.confirm(j.user,{id:draft.id,expectedRevision:before.revision})]);
    assert.ok(results.some(r=>r.status==='fulfilled'));
    assert.equal((await finance.read('2026-10')).state.simpleAccounts.filter(a=>a.name==='Internet').length,1);
    assert.equal((await chat.list(h.user)).messages.filter(m=>m.saved && m.preview?.name==='Internet').length,2);
  });
  await t.test('a SQL failure after financial writes rolls back the account and chat receipt together',async()=>{
    const draft=(await chat.send(h.user,{id:randomUUID(),text:'Teste rollback 15',month:'2026-10'})).messages[1];
    const before=await finance.read('2026-10');
    const failing:Transport={batch:(qs,ro)=>db.batch(!ro && qs.some(s=>s.text.startsWith('UPDATE finance_v2.chat_messages')) ? [...qs,q('SELECT 1/0')] : qs,ro)};
    await assert.rejects(createChatService(failing).confirm(h.user,{id:draft.id,expectedRevision:before.revision}),{status:409});
    const after=await finance.read('2026-10');assert.equal(after.revision,before.revision);assert.deepEqual(after.state,before.state);
    assert.equal((await chat.list(j.user)).messages.find(m=>m.id===draft.id)?.saved,false);
  });
  await t.test('history search filters by actor and content and cannot cross household',async()=>{
    const search=await chat.list(h.user,{q:'Mercado',author:j.user.id});assert.equal(search.messages.length,1);assert.equal(search.messages[0].saved,true);
    assert.equal((await chat.list({...h.user,householdId:randomUUID()})).messages.length,0);
    assert.equal((await invoke(h.token,'GET',undefined,{householdId:randomUUID()})).status,400);
    assert.equal((await invoke(h.token,'GET',undefined,{before:'invalid'})).status,400);
  });
  await t.test('all history remains reachable across pagination without duplicate rows',async()=>{
    const entries=Array.from({length:105},(_,i)=>q(`INSERT INTO finance_v2.chat_messages (id,household_id,request_id,role,author_user_id,actor_user_id,author_name,actor_name,content) VALUES ($1,$2,$1,'user',$3,$3,$4,$4,$5)`,[randomUUID(),h.user.householdId,h.user.id,h.user.name,`Antiga ${i}`]));
    await db.batch(entries,false);
    let page=await chat.list(j.user);const seen=new Set(page.messages.map(m=>m.id));assert.equal(page.messages.length,100);assert.ok(page.nextBefore);
    while(page.nextBefore){page=await chat.list(j.user,{before:page.nextBefore});for(const m of page.messages){assert.ok(!seen.has(m.id));seen.add(m.id);}}
    assert.ok(seen.has(hId));assert.ok(seen.has(jId));
  });
  await t.test('natural card purchase keeps authenticated author, waits for card and explicit confirmation',async()=>{
    let view=await finance.read('2026-10');
    await finance.execute({action:'card.create',month:'2026-10',expectedRevision:view.revision,data:{name:'Nubank'}},h.user.id);
    view=await finance.read('2026-10');
    const result=await chat.send(j.user,{id:randomUUID(),text:'Fiz uma compra de 80 reais no mercado alvorada no cartão',month:'2026-10'});
    assert.equal(result.messages[0].authorId,j.user.id);
    const draft=result.messages[1];assert.equal(draft.preview?.name,'Mercado Alvorada');
    assert.equal(draft.preview?.amount,80);assert.equal(draft.preview?.month,'2026-10');assert.equal(draft.preview?.requiresCard,true);
    assert.equal(draft.interactionAuthor?.id,j.user.id);
    assert.deepEqual((await finance.read('2026-10')).state,view.state);
    await assert.rejects(chat.confirm(j.user,{id:draft.id,expectedRevision:view.revision}));
    assert.deepEqual((await finance.read('2026-10')).state,view.state);
    const card=view.state.creditCards.find(c=>c.name==='Nubank')!;
    const preview=choosePreviewCard(draft.preview!,card.id,view.state.creditCards);
    assert.deepEqual((await finance.read('2026-10')).state,view.state);
    await chat.confirm(j.user,{id:draft.id,expectedRevision:view.revision,preview});
    const after=await finance.read('2026-10');
    const expense=after.state.cardExpenses.find(e=>e.description==='Mercado Alvorada')!;
    assert.equal(expense.amount,80);assert.equal(expense.cardId,card.id);assert.equal(expense.month,'2026-10');
    assert.equal(after.state.simpleAccounts.length,view.state.simpleAccounts.length);
  });
});
