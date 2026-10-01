import { createInterface } from 'node:readline/promises';
import { BackupError,createNeonBackupService } from '../server/backup/neonBackup.js';

// Credentials come exclusively from the operator's environment, never argv or frontend.
async function main() {
  const [command,...args]=process.argv.slice(2),service=createNeonBackupService();
  if(command==='list' && args.length===0){console.log(JSON.stringify(await service.list(),null,2));return;}
  if(command==='create' && args.length===1){console.log(JSON.stringify(await service.create(args[0]),null,2));return;}
  if(command==='operation' && args.length===1){console.log(JSON.stringify(await service.operation(args[0]),null,2));return;}
  if(command==='restore' && args.length===2){
    if(!process.stdin.isTTY || !process.stdout.isTTY)throw new BackupError('INTERACTIVE_REQUIRED','Restauração exige terminal interativo; pipes e confirmação automática não são aceitos.');
    const plan=await service.prepareRestore(args[0],args[1]);
    console.log(JSON.stringify(plan,null,2));
    console.log('A cópia será restaurada em uma NOVA branch. Produção e conexão do app permanecem intactas.');
    const input=createInterface({input:process.stdin,output:process.stdout});
    try {const confirmation=await input.question(`Digite exatamente: ${plan.confirmation}\n> `);console.log(JSON.stringify(await service.restore(plan.id,confirmation),null,2));}
    finally{input.close();}
    return;
  }
  throw new BackupError('USAGE','Uso: tsx scripts/neon-backup.ts list | create <nome> | operation <id> | restore <snapshot-id> <recovery-nome>');
}
main().catch(error=>{console.error(error instanceof BackupError ? `${error.code}: ${error.message}${error.status ? ` (HTTP ${error.status})` : ''}` : 'Falha administrativa; nenhum detalhe sensível foi exibido.');process.exitCode=1;});
