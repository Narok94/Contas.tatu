import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
// Configure the already verified finance database without exposing its connection string.
const env=parseEnv(await readFile('.env.local','utf8'));
if (!env.CONTAS_TATU_DATABASE_URL) throw new Error('Missing server configuration');
const target=new URL(env.CONTAS_TATU_DATABASE_URL);
if(target.hostname!=='ep-mute-flower-b7tq5afc-pooler.c-13.us-east-1.aws.neon.tech'||target.pathname!=='/neondb') throw new Error('Target requires review');
const cli=join(process.env.APPDATA!, 'npm/node_modules/vercel/dist/vc.js');
const child=spawn(process.execPath,[cli,'env','update','CONTAS_TATU_DATABASE_URL','production','--yes','--sensitive'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
child.stdout.resume();child.stderr.resume();child.stdin.end(env.CONTAS_TATU_DATABASE_URL);
child.on('exit',code=>{console.log(code===0?'Production server connection updated securely.':'Production connection configuration failed; details suppressed.');process.exitCode=code??1;});
