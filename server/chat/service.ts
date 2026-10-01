import { randomUUID } from 'node:crypto';
import type { Identity } from '../auth/service.js';
import { FoundationError } from '../foundation.js';
import { neonTransport, q, createRepository, type Transport } from '../finance/repository.js';
import { createFinanceService } from '../finance/service.js';
import { keys, object, uuid, month, money, integer, text } from '../finance/validation.js';
import { interpret, previewCommand, type ChatMessage, type Preview } from '../../src/mobile/conversation.js';

type Row = Record<string, any>;
const decode = (r: Row): ChatMessage => ({
  id: r.id, sequence: String(r.sequence), authorId: r.author_user_id ?? 'assistant', authorName: r.author_name,
  role: r.role, text: r.content, createdAt: new Date(r.created_at).toISOString(), preview: r.confirmed_preview ?? r.preview ?? undefined,
  originalPreview: r.confirmed_preview ? r.preview : undefined,
  saved: r.saved, linkedFinancialOperationId: r.financial_operation_id ?? undefined,
  interactionAuthor: r.role === 'assistant' ? { id: r.actor_user_id, name: r.actor_name } : undefined,
});
function checkedPreview(value: unknown): Preview {
  const p = object(value); keys(p, ['name','amount','month','count','paid','cardId','cardName','categoryId']);
  if (typeof p.paid !== 'boolean') throw new FoundationError(400, 'Invalid preview');
  return { name: text(p.name)!, amount: money(p.amount), month: month(p.month), count: integer(p.count, 1, 120), paid: p.paid,
    cardId: p.cardId === undefined ? undefined : uuid(p.cardId), cardName: p.cardName === undefined ? undefined : text(p.cardName)!,
    categoryId: p.categoryId === undefined ? undefined : uuid(p.categoryId) };
}
function insert(identity: Identity, id: string, requestId: string, role: 'user'|'assistant', content: string, preview?: Preview, operationId?: string) {
  return q(`INSERT INTO finance_v2.chat_messages
    (id,household_id,request_id,role,author_user_id,actor_user_id,author_name,actor_name,content,preview,saved,financial_operation_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) ON CONFLICT (household_id,request_id,role) DO NOTHING`,
    [id, identity.householdId, requestId, role, role === 'user' ? identity.id : null, identity.id,
      role === 'user' ? identity.name : 'Contas Tatu', identity.name, content, preview ? JSON.stringify(preview) : null, !!operationId, operationId ?? null]);
}
export function createChatService(db: Transport = neonTransport) {
  const finance = createFinanceService(createRepository(db));
  async function pair(identity: Identity, requestId: string) {
    const [rows] = await db.batch([q('SELECT * FROM finance_v2.chat_messages WHERE household_id=$1 AND request_id=$2 ORDER BY sequence', [identity.householdId,requestId])],true);
    return rows;
  }
  return {
    async list(identity: Identity, query: Record<string, unknown> = {}) {
      keys(query,['before','q','author']);
      const before = query.before === undefined ? null : String(query.before);
      if (before !== null && !/^[1-9]\d{0,18}$/.test(before)) throw new FoundationError(400,'Invalid cursor');
      const search = query.q === undefined || query.q === '' ? '' : text(query.q)!;
      const author = query.author === undefined || query.author === '' ? null : uuid(query.author);
      const [rows,participants] = await db.batch([
        q(`SELECT * FROM finance_v2.chat_messages WHERE household_id=$1 AND ($2::bigint IS NULL OR sequence<$2)
          AND ($3='' OR strpos(lower(content||COALESCE(preview::text,'')||COALESCE(confirmed_preview::text,'')),lower($3))>0)
          AND ($4::uuid IS NULL OR actor_user_id=$4) ORDER BY sequence DESC LIMIT 101`,[identity.householdId,before,search,author]),
        q(`SELECT u.id,u.display_name AS name FROM finance_v2.app_users u JOIN finance_v2.household_memberships m ON m.user_id=u.id
          JOIN finance_v2.auth_credentials c ON c.user_id=u.id WHERE m.household_id=$1 AND c.enabled AND c.login IN ('henrique','jessica') ORDER BY c.login`,[identity.householdId]),
      ],true);
      const page = rows.slice(0,100).reverse();
      return { messages: page.map(decode), participants, nextBefore: rows.length>100 ? String(page[0].sequence) : null };
    },
    async send(identity: Identity, value: unknown) {
      const input=object(value); keys(input,['id','text','month']);
      const id=uuid(input.id), m=month(input.month);
      if (typeof input.text!=='string' || !input.text.trim() || input.text.length>300) throw new FoundationError(400,'Invalid message');
      const content=input.text.trim();
      const existing=await pair(identity,id);
      if (!existing.length) {
        const view=await finance.read(m);
        const preview=interpret(content,m,view.state.creditCards,view.state.categories) ?? undefined;
        await db.batch([insert(identity,id,id,'user',content),insert(identity,randomUUID(),id,'assistant',preview ? 'Confira antes de adicionar' : 'Não consegui entender tudo. Quer preencher manualmente?',preview)],false);
      }
      const rows=await pair(identity,id);
      if (rows[0]?.actor_user_id!==identity.id || rows[0]?.content!==content) throw new FoundationError(409,'Message identifier already used');
      return { messages: rows.map(decode) };
    },
    async confirm(identity: Identity, value: unknown) {
      const input=object(value); keys(input,['id','expectedRevision','preview']);
      const id=uuid(input.id);
      const [rows]=await db.batch([q("SELECT * FROM finance_v2.chat_messages WHERE household_id=$1 AND id=$2 AND role='assistant'",[identity.householdId,id])],true);
      const message=rows[0];
      if (!message?.preview) throw new FoundationError(404,'Preview not found');
      if (message.saved) return { alreadySaved: true, message: decode(message) };
      const preview=checkedPreview(input.preview ?? message.preview);
      const operationId=randomUUID();
      const atomic: Transport = { batch: async (queries,readOnly) => {
        if (readOnly) return db.batch(queries,true);
        try {
          const result=await db.batch([
            q('SELECT id FROM finance_v2.chat_messages WHERE household_id=$1 AND id=$2 FOR UPDATE',[identity.householdId,id]),
            q('SELECT 1 / CASE WHEN EXISTS (SELECT 1 FROM finance_v2.chat_messages WHERE household_id=$1 AND id=$2 AND NOT saved) THEN 1 ELSE 0 END AS chat_guard',[identity.householdId,id]),
            ...queries,
            q('UPDATE finance_v2.chat_messages SET confirmed_preview=$3::jsonb,saved=true,financial_operation_id=$4 WHERE household_id=$1 AND id=$2',[identity.householdId,id,JSON.stringify(preview),operationId]),
            insert(identity,operationId,operationId,'assistant','✓ Conta adicionada com sucesso',preview,operationId),
          ],false);
          return result.slice(2,2+queries.length);
        } catch (error) {
          if ((error as {code?:string}).code==='22012') throw new FoundationError(409,'Dados atualizados em outra sessão. Atualize a conversa.');
          throw error;
        }
      }};
      const cmd=previewCommand(preview);
      await createFinanceService(createRepository(atomic)).execute({ ...cmd, month:preview.month,expectedRevision:input.expectedRevision },identity.id);
      const [updated]=await db.batch([q('SELECT * FROM finance_v2.chat_messages WHERE household_id=$1 AND id=$2',[identity.householdId,id])],true);
      return { alreadySaved:false, message:decode(updated[0]) };
    },
  };
}
