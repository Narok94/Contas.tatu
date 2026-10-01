import { randomUUID } from 'node:crypto';

// Management-plane only. No SQL, migrations, application route or production cutover.
export const BACKUP_TARGET = Object.freeze({ projectId:'small-dream-79132114', branchId:'br-purple-tree-b7rcasev' });
const BASE='https://console.neon.tech/api/v2';
const idPattern=/^[a-z0-9-]{1,60}$/;
export class BackupError extends Error {
  constructor(public code:string, message:string, public status?:number) { super(message); }
}
export interface Snapshot { id:string; name:string; sourceBranchId:string; createdAt:string; timestamp?:string; expiresAt:string|null }
export interface Operation { id:string; status:string }
export interface RestorePlan { id:string; snapshot:Snapshot; projectId:string; sourceBranchId:string; recoveryBranchName:string; expiresAt:string; confirmation:string }
type RecordValue=Record<string,unknown>;
function record(value:unknown):RecordValue {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new BackupError('INVALID_RESPONSE','Resposta inválida do Neon.');
  return value as RecordValue;
}
function identifier(value:unknown):string {
  if(typeof value!=='string' || !idPattern.test(value))throw new BackupError('INVALID_ID','Identificador inválido.');
  return value;
}
function date(value:unknown):string {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))throw new BackupError('INVALID_RESPONSE','Data inválida do Neon.');
  return value;
}
function snapshot(value:unknown):Snapshot {
  const row=record(value);
  if(typeof row.name!=='string')throw new BackupError('INVALID_RESPONSE','Snapshot inválido.');
  return {id:identifier(row.id),name:row.name,sourceBranchId:identifier(row.source_branch_id),createdAt:date(row.created_at),
    timestamp:row.timestamp===undefined?undefined:date(row.timestamp),expiresAt:row.expires_at==null?null:date(row.expires_at)};
}
function operations(value:unknown):Operation[] {
  if(!Array.isArray(value))throw new BackupError('INVALID_RESPONSE','Operações inválidas do Neon.');
  return value.map(v=>{const row=record(v);if(typeof row.status!=='string')throw new BackupError('INVALID_RESPONSE','Estado inválido do Neon.');return {id:identifier(row.id),status:row.status};});
}
export function createNeonBackupService(options:{env?:NodeJS.ProcessEnv;fetcher?:typeof fetch;now?:()=>number}={}) {
  const env=options.env ?? process.env, fetcher=options.fetcher ?? globalThis.fetch.bind(globalThis), now=options.now ?? Date.now;
  const plans=new Map<string,RestorePlan>();
  function config() {
    const {CONTAS_TATU_NEON_API_KEY:apiKey,CONTAS_TATU_NEON_PROJECT_ID:projectId,CONTAS_TATU_NEON_BRANCH_ID:branchId}=env;
    if(!apiKey?.trim() || /[\r\n]/.test(apiKey) || projectId!==BACKUP_TARGET.projectId || branchId!==BACKUP_TARGET.branchId)
      throw new BackupError('CONFIGURATION','Configure a chave administrativa e o projeto/branch esperados do Neon.');
    return {apiKey,projectId,branchId};
  }
  async function request(path:string,method:'GET'|'POST'='GET',body?:unknown):Promise<RecordValue> {
    const {apiKey}=config();
    let response:Response;
    try {
      response=await fetcher(BASE+path,{method,redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
        body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    } catch {
      throw new BackupError('UNKNOWN_OUTCOME',method==='POST'?'Resultado incerto. Consulte snapshots/operações antes de repetir; não há repetição automática.':'Não foi possível consultar o Neon.');
    }
    if(!response.ok)throw new BackupError('NEON_API','Neon recusou a operação. Verifique acesso, disponibilidade e limites do plano.',response.status);
    try {return record(await response.json());}catch {throw new BackupError('INVALID_RESPONSE','Resposta inválida do Neon; consulte o estado antes de repetir.');}
  }
  function projectPath(){return `/projects/${config().projectId}`;}
  async function verifySource() {
    const cfg=config(),body=await request(`${projectPath()}/branches/${cfg.branchId}`),branch=record(body.branch);
    if(branch.id!==cfg.branchId || branch.project_id!==cfg.projectId || branch.name!=='main')throw new BackupError('TARGET_MISMATCH','A branch de origem não corresponde ao banco esperado.');
  }
  async function list() {
    await verifySource();
    const body=await request(`${projectPath()}/snapshots`);
    if(!Array.isArray(body.snapshots))throw new BackupError('INVALID_RESPONSE','Lista de snapshots inválida.');
    return body.snapshots.map(snapshot).filter(s=>s.sourceBranchId===config().branchId).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  }
  async function available(snapshotId:string) {
    const found=(await list()).find(s=>s.id===identifier(snapshotId));
    if(!found || found.expiresAt!==null && Date.parse(found.expiresAt)<=now())throw new BackupError('UNAVAILABLE_SNAPSHOT','Snapshot ausente, expirado ou de outra branch.');
    return found;
  }
  return {
    configured() {
      try { config(); return true; } catch (error) {
        if(error instanceof BackupError && error.code==='CONFIGURATION')return false;
        throw error;
      }
    },
    list,
    async create(name:string) {
      if(typeof name!=='string' || !/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,79}$/.test(name))throw new BackupError('INVALID_NAME','Nome do ponto seguro inválido (até 80 caracteres).');
      await verifySource();
      const body=await request(`${projectPath()}/branches/${config().branchId}/snapshot?${new URLSearchParams({name})}`,'POST');
      const point=snapshot(body.snapshot);
      if(point.sourceBranchId!==config().branchId)throw new BackupError('TARGET_MISMATCH','Snapshot retornado de outra branch.');
      return {snapshot:point,operations:operations(body.operations)};
    },
    async operation(operationId:string) {
      const body=await request(`${projectPath()}/operations/${identifier(operationId)}`),op=record(body.operation);
      if(op.id!==operationId || op.project_id!==config().projectId || typeof op.status!=='string')throw new BackupError('INVALID_RESPONSE','Operação inválida do Neon.');
      return {id:operationId,status:op.status};
    },
    async prepareRestore(snapshotId:string,recoveryBranchName:string):Promise<RestorePlan> {
      identifier(snapshotId);
      if(typeof recoveryBranchName!=='string' || !/^recovery-[a-z0-9][a-z0-9-]{0,49}$/.test(recoveryBranchName))throw new BackupError('INVALID_NAME','A restauração exige uma nova branch com prefixo recovery-.');
      for(const [id,p]of plans)if(Date.parse(p.expiresAt)<=now())plans.delete(id);
      if(plans.size>=100)throw new BackupError('PLAN_LIMIT','Há planos demais aguardando confirmação.');
      const point=await available(snapshotId),cfg=config();
      const branches=await request(`${projectPath()}/branches`);
      if(!Array.isArray(branches.branches) || branches.branches.some(b=>record(b).name===recoveryBranchName))throw new BackupError('BRANCH_EXISTS','A branch de recuperação já existe ou não pôde ser verificada.');
      const plan:RestorePlan={id:randomUUID(),snapshot:point,projectId:cfg.projectId,sourceBranchId:cfg.branchId,recoveryBranchName,
        expiresAt:new Date(now()+5*60_000).toISOString(),confirmation:`RESTAURAR ${snapshotId} EM ${recoveryBranchName}`};
      plans.set(plan.id,structuredClone(plan));
      return plan;
    },
    async restore(planId:string,confirmation:string) {
      const plan=plans.get(planId);
      if(!plan || Date.parse(plan.expiresAt)<=now() || confirmation!==plan.confirmation)throw new BackupError('CONFIRMATION_REQUIRED','Confirmação exata e plano válido são obrigatórios.');
      // Consume before the first await: concurrent requests and uncertain results cannot replay this plan.
      plans.delete(planId);
      if(config().projectId!==plan.projectId || config().branchId!==plan.sourceBranchId)throw new BackupError('TARGET_MISMATCH','A configuração mudou desde a confirmação.');
      const point=await available(plan.snapshot.id);
      if(point.createdAt!==plan.snapshot.createdAt || point.timestamp!==plan.snapshot.timestamp)throw new BackupError('TARGET_MISMATCH','O snapshot mudou desde a preparação.');
      const branches=await request(`${projectPath()}/branches`);
      if(!Array.isArray(branches.branches) || branches.branches.some(b=>record(b).name===plan.recoveryBranchName))throw new BackupError('BRANCH_EXISTS','A branch de recuperação já existe ou não pôde ser verificada.');
      const body=await request(`${projectPath()}/snapshots/${plan.snapshot.id}/restore`,'POST',{
        name:plan.recoveryBranchName,target_branch_id:plan.sourceBranchId,finalize_restore:false,
      });
      const branch=record(body.branch);
      if(branch.id===plan.sourceBranchId || branch.project_id!==plan.projectId || branch.name!==plan.recoveryBranchName)throw new BackupError('INVALID_RESPONSE','Verifique o resultado no Neon antes de repetir.');
      return {branch:{id:identifier(branch.id),name:plan.recoveryBranchName},operations:operations(body.operations)};
    },
  };
}
