# Persistência financeira controlada

Implementação server-side sem autenticação definitiva ou importação de dados.
A integração posterior do frontend está em [FRONTEND-PERSISTENCE.md](FRONTEND-PERSISTENCE.md). `001_finance_v2.sql` permanece a fonte do schema.

## Camadas

- `accounts.ts`: simples e recorrentes, incluindo registro mensal independente.
- `cards.ts`: cadastro de cartões e despesas; pagamento usa o domínio existente.
- `installments.ts`: criação e comandos temporais, delegados às funções auditadas.
- `mapping.ts`: conversão SQL ↔ tipos do domínio, incluindo histórico e snapshots.
- `repository.ts`: leituras consistentes, gravação de diferenças, FKs e transações.
- `service.ts`: comandos, pagamentos, fechamento/reabertura e projeções/resumos.
- `api.ts`: transporte HTTP e erros sanitizados.

Todos os acessos usam `getNeonClient()` e o household fixo da fundação. Nenhuma
leitura inicializa dados e nenhum comando aceita household do cliente. Os únicos
valores de conexão vêm de `CONTAS_TATU_DATABASE_URL`.

## Concorrência e histórico

Uma leitura SQL retorna revisão e estado sob um único snapshot MVCC. O comando
exige `expectedRevision` como string, aplica as regras puras em memória e grava
em transação: lock do household, conferência da revisão, alterações, incremento.
Conflito retorna 409 e rollback integral; recarregar antes de tentar novamente.
Não há retry automático de escrita. Após resposta incerta, consultar o estado;
reenviar a revisão antiga não duplica pagamentos ou compras.

As tabelas existentes recebem apenas diferenças. Exclusões operacionais viram
`archived_at`, sem DELETE físico. As leituras ativas filtram arquivos. Versões
de parcelamentos e fechamentos são append-only. Reabertura acrescenta evento e
limpa o ponteiro oficial, preservando payloads anteriores. Histórico usa o
ponteiro e eventos, nunca simplesmente MAX(revision). Não há calendário materializado.

Pagamentos parciais são exclusivos de cartões. `paidAmount` é total acumulado,
não incremento. O saldo anterior vem do resolvedor existente: 1000−900=100;
1900+100−1500=500; outubro recebe só 500. Anual soma somente valores efetivamente
pagos, sem adicionar compras internas ou saldo novamente. A divisão legada
100/3 continua 33,33 por parcela. Quitação usa o evento e, no cartão, o pagamento
da fatura na mesma transação. Correção retroativa respeita reabertura e overrides.

## Contrato HTTP

Mesmas restrições locais da fundação: `CONTAS_TATU_ENABLE_LOCAL_API=true`, loopback,
Host local, sem cabeçalhos de encaminhamento, Origin ausente ou exatamente igual
à origem HTTP local; bloqueado quando VERCEL estiver presente
ou NODE_ENV=production. Isso NÃO é autenticação definitiva. Sem escrita remota
anônima. Antes da integração pública, implementar identidade/membership/autorização.

- `GET /api/finance?month=2026-09`: revisão, estado tipado, contas, resumo mensal,
  anual paid-only, parcelamentos ativos e subconjuntos informativos de parcial.
- `HEAD /api/finance?month=2026-09`: mesma validação/status, sem corpo.
- `GET /api/finance?month=2026-09&payoffId=<uuid>`: cotação de quitação e revisão.
- `POST /api/finance/commands`: `{action, month, expectedRevision, data}`.

Comandos e campos de `data` (campos opcionais indicados com `?`):

| action | data |
| --- | --- |
| simple.create | name, value, categoryId?, notes? |
| simple.edit | id, name, value, categoryId?, notes? |
| simple.archive | id |
| recurring.create | name, initialValue, categoryId?, notes? |
| recurring.edit | id, name, value, categoryId?, notes? |
| recurring.archive | id |
| card.create | name, brand?, color? |
| card.edit | id, name, brand?, color? |
| card.archive | id; recusado quando referenciado por versões |
| expense.create | cardId, description, amount, categoryId? |
| expense.edit | id, description, amount, categoryId? |
| expense.archive | id |
| installment.create | description, totalAmount, installmentsCount, creditCardId?, categoryId?, notes? |
| installment.change / installment.correct | id, description, totalAmount, installmentsCount, currentInstallment, reason, creditCardId?, categoryId? |
| installment.cancel | id, reason |
| installment.payoff | id, amount, reason |
| payment | id, type (simple/recurring/installment/credit_card), status (pendente/parcial/pago), amount? |
| month.close / month.reopen | objeto vazio |

No parcelamento, creditCardId omitido preserva o vínculo e string vazia o remove.
Edições de simples/despesa mantêm seu mês original. Recorrente modifica o valor
somente no mês do comando; nome/categoria pertencem à definição, como no domínio
atual. IDs novos são UUIDs atribuídos pelo servidor. A resposta de comando contém
revisão e estado, sem metadados de conexão ou mensagens SQL. Valor ausente em novo
mês recorrente continua zero virtual, não uma escrita automática.

## Limites e validação

Não houve incompatibilidade estrutural que exigisse migration. IDs textuais
virtuais do domínio para faturas/recorrentes são convertidos em UUIDs somente ao
persistir novos registros. Não se trata de migração de IDs do localStorage.
Snapshots legados são lidos sem regravação. Importação de localStorage segue fora
do escopo; dados não migrados não devem ser descartados na futura troca de backend.

O MVP carrega todo o estado do household para reutilizar exatamente os cálculos
atuais; paginação/otimização poderá ser necessária com volume maior. A API está
pronta para integração local controlada, não para liberar escrita multiusuário.

PGlite é dependência apenas de desenvolvimento. Testes executam a migration
oficial em PostgreSQL/WASM isolado, sem rede ou credenciais. Exercitam round-trip,
transações, FKs, rollback, disputa de revisão, histórico e triggers. Não substituem
teste de carga/conexões concorrentes do Neon. A inspeção final no Neon real é
somente leitura e deve manter apenas 1 household, 1 usuário técnico, 1 membro e
7 categorias; nenhuma tabela financeira recebe fixtures de teste.
