import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authMutationHandler } from '../server/auth/router.js';
import type { createAuthService } from '../server/auth/service.js';

test('shared auth function preserves login/logout, method and origin checks', async () => {
  const calls: string[] = [];
  const auth = {
    async login() { calls.push('login'); return { token:'opaque',user:{name:'Henrique'} }; },
    async logout() { calls.push('logout'); },
  } as unknown as ReturnType<typeof createAuthService>;
  const handler = authMutationHandler(auth);
  async function invoke(url:string,method='POST',origin='http://localhost:3100') {
    const headers:Record<string,string> = {};
    const response = {statusCode:0,body:'',setHeader(k:string,v:string){headers[k]=v;},end(v:string){this.body=v;}};
    await handler({url,method,headers:{origin,host:'localhost:3100','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'},body:{}} as any,response as any);
    return {...response,headers};
  }
  const login = await invoke('/api/auth/login?action=logout');
  assert.equal(login.statusCode,200);assert.deepEqual(calls,['login']);assert.match(login.headers['Set-Cookie'],/HttpOnly/);
  assert.equal((await invoke('/api/auth/logout?action=login')).statusCode,200);assert.deepEqual(calls,['login','logout']);
  assert.equal((await invoke('/api/auth/login','GET')).statusCode,405);
  assert.equal((await invoke('/api/auth/logout','GET')).statusCode,405);
  assert.equal((await invoke('/api/auth/login','POST','https://evil.test')).statusCode,403);
  for(const url of ['/api/auth/unknown?action=login','/api/auth/session','/api/auth/login/extra','/api/auth/LOGIN'])
    assert.equal((await invoke(url)).statusCode,404);
  assert.deepEqual(calls,['login','logout']);
});
