import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createAuthService, digest } from '../server/auth/service';
import { provisionUsers } from '../server/auth/provision';
import { createFoundation } from '../server/foundation';
import { q, type Transport } from '../server/finance/repository';
import { authenticated, sessionCookie, sameOrigin } from '../server/auth/access';
import { authHandler } from '../server/auth/api';
import { financeHandler } from '../server/finance/api';

test('closed authentication, password hashes, sessions, access and household isolation', async t => {
  const pg=new PGlite(); t.after(()=>pg.close());
  await pg.exec(readFileSync('database/migrations/001_finance_v2.sql','utf8'));
  await pg.exec(readFileSync('database/migrations/002_closed_auth.sql','utf8'));
  const db:Transport={batch:(qs,ro)=>pg.transaction(async tx=>{
    if(ro)await tx.exec('SET TRANSACTION READ ONLY');const result=[];
    for(const s of qs)result.push((await tx.query(s.text,s.values)).rows);return result as any;
  })};
  await createFoundation({transaction:(qs,ro=false)=>db.batch(qs,ro)}).initialize();
  const password=randomBytes(20).toString('base64url'); await provisionUsers(db,password);
  const auth=createAuthService(db);
  let token='';
  await t.test('both accounts authenticate and belong to the existing same household',async()=>{
    const h=await auth.login({login:'Henrique',password,remember:true},'test-1');
    const key=randomBytes(32).toString('hex');
    const j=await auth.login({login:'Jessica',password,navigationKey:key},'test-2');
    assert.equal(h.user.name,'Henrique');assert.equal(j.user.name,'Jéssica');
    assert.equal(h.user.householdId,j.user.householdId);assert.notEqual(h.user.id,j.user.id);
    assert.equal(h.age,30*86400);assert.equal(j.age,undefined);token=h.token;
    const [stored]=await db.batch([q('SELECT password_hash FROM finance_v2.auth_credentials')],true);
    assert.ok(stored.every(r=>/^\$2b\$12\$/.test(String(r.password_hash))));
    assert.ok(stored.every(r=>r.password_hash!==password));assert.notEqual(stored[0].password_hash,stored[1].password_hash);
    assert.deepEqual((await auth.session(j.token,false,key))?.user,j.user);
    assert.equal(await auth.session(j.token),undefined);
    assert.equal(await auth.session(j.token,false,randomBytes(32).toString('hex')),undefined);
    await auth.logout(j.token,key);
    assert.equal(await auth.session(j.token,false,key),undefined);
    assert.ok(!JSON.stringify(h.user).includes('hash'));
    const [sessions]=await db.batch([q('SELECT token_hash FROM finance_v2.auth_sessions')],true);
    assert.ok(sessions.every(r=>r.token_hash!==h.token&&r.token_hash!==j.token));
  });
  await t.test('invalid username and password share the same error; client identity rejected',async()=>{
    for(const v of [{login:'Henrique',password:'wrong',remember:true},{login:'unknown',password,remember:true},{login:'Jessica',password,remember:true,householdId:'other'}]) {
      await assert.rejects(auth.login(v,'invalid'),{status:401,message:'Usuário ou senha incorretos.'});
    }
  });
  await t.test('renewal preserves absolute lifetime and cannot resurrect a logged-out session',async()=>{
    await db.batch([q("UPDATE finance_v2.auth_sessions SET renewed_at=CURRENT_TIMESTAMP-INTERVAL '2 days' WHERE token_hash=$1",[digest(token)])],false);
    const renewed=await auth.session(token,true);assert.ok(renewed?.token);assert.equal(renewed.token,token);
    assert.ok(renewed.age!<=30*86400);
    await auth.logout(token);assert.equal(await auth.session(token),undefined);
    assert.equal(await auth.session(renewed.token),undefined);
    const expired=await auth.login({login:'Henrique',password,remember:true},'expiry');
    await db.batch([q("UPDATE finance_v2.auth_sessions SET created_at=CURRENT_TIMESTAMP-INTERVAL '2 days',expires_at=CURRENT_TIMESTAMP-INTERVAL '1 day' WHERE token_hash=$1",[digest(expired.token)])],false);
    assert.equal(await auth.session(expired.token),undefined);
    const version=await auth.login({login:'Jessica',password,remember:true},'version');
    await db.batch([q("UPDATE finance_v2.auth_credentials SET password_version=password_version+1 WHERE login='jessica'")],false);
    assert.equal(await auth.session(version.token),undefined);
  });
  await t.test('production cookie, CSRF and protected route without session',async()=>{
    const saved={env:process.env.NODE_ENV,origin:process.env.CONTAS_TATU_APP_ORIGIN};
    process.env.NODE_ENV='production';process.env.CONTAS_TATU_APP_ORIGIN='https://example.test';
    try {
      const cookie=sessionCookie('opaque',30);assert.match(cookie,/^__Host-/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Max-Age=30/);
      const req:any={method:'POST',headers:{origin:'https://evil.test'},socket:{remoteAddress:'127.0.0.1'}};
      assert.equal(sameOrigin(req,true),false);assert.equal(await authenticated(req,auth),undefined);
      let status=0,body='';const res:any={setHeader(){},set statusCode(v:number){status=v},end(v:string){body=v}};
      req.method='GET';req.headers={};
      await financeHandler(false,{read(){throw new Error('Must not access financial data')}} as any,auth)(req,res);
      assert.equal(status,401);assert.ok(!body.includes('SQL'));
      await authHandler('session',auth)(req,res);assert.equal(status,401);
    } finally {
      if(saved.env===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=saved.env;
      if(saved.origin===undefined)delete process.env.CONTAS_TATU_APP_ORIGIN;else process.env.CONTAS_TATU_APP_ORIGIN=saved.origin;
    }
  });
  await t.test('serverless-safe repeated-attempt limiter',async()=>{
    for(let i=0;i<10;i++)await assert.rejects(auth.login({login:'nobody',password:'wrong',remember:true},'limited'),{status:401});
    await assert.rejects(auth.login({login:'nobody',password:'wrong',remember:true},'limited'),{status:429});
  });
});
