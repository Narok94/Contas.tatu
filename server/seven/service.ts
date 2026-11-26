import { FoundationError, DEFAULT_HOUSEHOLD_ID } from '../foundation.js';
import { neonTransport, q, type Transport } from '../finance/repository.js';
import type { Identity } from '../auth/service.js';
import { canAccessSeven, type SevenExpense } from '../../src/seven/model.js';

const fail = (message = 'Dados inválidos.') => { throw new FoundationError(400, message); };
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fields = `id,description,location,to_char(expense_date,'YYYY-MM-DD') AS date,cents,notes,account_id AS "accountId",version`;
export function validateExpense(value: unknown): SevenExpense {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as SevenExpense;
  if (Object.keys(v).some(k => !['id','description','location','date','cents','notes','accountId','images','version'].includes(k))) return fail();
  if (!uuid(v.id) || !Number.isInteger(v.version) || v.version < 0 || !Number.isInteger(v.cents) || v.cents <= 0 || v.cents > 100000000) return fail();
  for (const [text, max] of [[v.description,200],[v.location,200],[v.notes,2000]] as const)
    if (typeof text !== 'string' || text.length > max) return fail();
  if (!v.description.trim() || !v.location.trim() || (v.accountId !== null && !uuid(v.accountId))) return fail();
  if (typeof v.date !== 'string' || !/^20\d\d-\d{2}-\d{2}$/.test(v.date) || !Number.isFinite(Date.parse(v.date)) || new Date(v.date).toISOString().slice(0,10) !== v.date) return fail('Data inválida.');
  if (!Array.isArray(v.images) || v.images.length < 1 || v.images.length > 10) return fail('Anexe de 1 a 10 imagens.');
  let bytes = 0;
  for (const img of v.images) {
    if (!img || typeof img.name !== 'string' || !img.name.trim() || img.name.length > 200 || typeof img.data !== 'string') return fail();
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(img.data);
    if (!match) return fail('Use imagens PNG, JPEG ou WebP.');
    const data = Buffer.from(match[2], 'base64');
    if (data.toString('base64') !== match[2]) return fail();
    const valid = match[1] === 'png' ? data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) : match[1] === 'jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255 : data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP';
    if (!valid || data.length > 1024*1024) return fail('Imagem inválida ou maior que 1 MB.');
    bytes += img.data.length;
  }
  if (bytes > 3*1024*1024) return fail('Os anexos juntos devem ocupar até 3 MB.');
  return { ...v, description:v.description.trim(), location:v.location.trim(), notes:v.notes.trim(), images:v.images.map(i => ({name:i.name,data:i.data})) };
}
export function createSevenService(db: Transport = neonTransport) {
  function authorize(user: Identity) {
    if (!canAccessSeven(user) || user.householdId !== DEFAULT_HOUSEHOLD_ID) throw new FoundationError(403,'Área exclusiva do Henrique.');
  }
  return {
    async read(user: Identity, query: Record<string, unknown> = {}) {
      authorize(user);
      if (Object.keys(query).some(k => !['month','id'].includes(k)) || (query.id && query.month)) return fail();
      if (query.id) {
        if (!uuid(query.id)) return fail();
        const [rows] = await db.batch([q(`SELECT ${fields},images FROM finance_v2.seven_expenses WHERE owner_id=$1 AND household_id=$2 AND id=$3`,[user.id,user.householdId,query.id])],true);
        if (!rows.length) throw new FoundationError(404,'Registro não encontrado.');
        return rows[0];
      }
      if (typeof query.month !== 'string' || !/^20\d\d-(0[1-9]|1[0-2])$/.test(query.month)) return fail('Mês inválido.');
      const [expenses,accounts] = await db.batch([
        q(`SELECT ${fields},jsonb_array_length(images) AS "imageCount" FROM finance_v2.seven_expenses WHERE owner_id=$1 AND household_id=$2 AND expense_date >= $3::date AND expense_date < $3::date + INTERVAL '1 month' ORDER BY expense_date,id`,[user.id,user.householdId,query.month+'-01']),
        q(`SELECT id,name,round(amount*100)::integer AS cents FROM finance_v2.simple_accounts WHERE household_id=$1 AND month=$2 AND archived_at IS NULL ORDER BY name`,[user.householdId,query.month+'-01']),
      ],true);
      return {expenses,totalCents:expenses.reduce((sum,row)=>sum+Number(row.cents),0),accounts};
    },
    async save(user: Identity, value: unknown) {
      authorize(user);
      const v = validateExpense(value);
      const params = [v.id,user.householdId,user.id,v.description,v.location,v.date,v.cents,v.notes,v.accountId,JSON.stringify(v.images),v.version];
      try {
        const [rows] = await db.batch([q(`INSERT INTO finance_v2.seven_expenses AS e
          (id,household_id,owner_id,description,location,expense_date,cents,notes,account_id,images)
          SELECT $1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10::jsonb WHERE
          ($11::integer=0 OR EXISTS(SELECT 1 FROM finance_v2.seven_expenses WHERE id=$1 AND owner_id=$3 AND household_id=$2))
          AND ($9::uuid IS NULL OR EXISTS(SELECT 1 FROM finance_v2.simple_accounts WHERE id=$9 AND household_id=$2 AND archived_at IS NULL))
          ON CONFLICT(id) DO UPDATE SET description=EXCLUDED.description,location=EXCLUDED.location,expense_date=EXCLUDED.expense_date,
          cents=EXCLUDED.cents,notes=EXCLUDED.notes,account_id=EXCLUDED.account_id,images=EXCLUDED.images,version=e.version+1,updated_at=CURRENT_TIMESTAMP
          WHERE e.owner_id=$3 AND e.household_id=$2 AND e.version=$11
          RETURNING id,version`,params)],false);
        if (!rows.length) throw new Error();
        return rows[0];
      } catch { throw new FoundationError(409,'Registro duplicado, vínculo indisponível ou versão alterada. Atualize a lista antes de tentar novamente.'); }
    },
    async remove(user: Identity, value: unknown) {
      authorize(user);
      const v = value as {id:string;version:number};
      if (!v || Object.keys(v).some(k=>!['id','version'].includes(k)) || !uuid(v.id) || !Number.isInteger(v.version) || v.version<1) return fail();
      const [rows] = await db.batch([q('DELETE FROM finance_v2.seven_expenses WHERE id=$1 AND owner_id=$2 AND household_id=$3 AND version=$4 RETURNING id',[v.id,user.id,user.householdId,v.version])],false);
      if (!rows.length) throw new FoundationError(409,'Registro alterado ou excluído. Atualize a lista.');
      return {ok:true};
    },
  };
}
