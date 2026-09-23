# Projeto do banco finance_v2 — etapa 2

**DRAFT ONLY — DO NOT EXECUTE WITHOUT REVIEW.** Proposta revisada sobre
`1d7a038236825c6fff6b9d6d7b7db750b1d88cbf`, em 23/09/2026, branch main.
O SQL correspondente é [001_finance_v2_draft.sql](../database/migrations/001_finance_v2_draft.sql).
Nenhum banco foi acessado; nenhum SQL foi executado, sequer localmente.

O draft contém **17 tabelas, 4 domains, 6 índices adicionais, 1 função de proteção
e 4 triggers de imutabilidade**, todos em finance_v2. A única instrução ALTER
completa a FK circular entre duas tabelas novas do próprio schema. Não há role,
GRANT, seed, driver, conexão, API financeira ou execução automática de migration.
O arquivo falha se o schema já existir; não usa IF NOT EXISTS para ocultar divergências.

## 1. Diagnóstico e fontes analisadas

O React/Vite mantém um `FinanceDataStore` completo em memória e o serializa como
JSON na chave `organizacao_financeira_store_v1` do localStorage. `FinanceContext`
centraliza comandos, valida meses fechados, salva antes de publicar o novo estado
React e apresenta erros de persistência. Não há transação multiusuário, revisão
otimista, validação completa do JSON importado nem sincronização entre abas.
O carregamento verifica apenas a existência do objeto e do array de categorias;
falhas de leitura podem resultar no conjunto de demonstração.

Arquitetura presente: componentes → FinanceContext → funções puras do domínio →
financeStorage/localStorage. Arquitetura futura prevista pelo README:
React/Vite → Vercel Function → Neon. `server/neon.ts` apenas exporta leitura tardia
de configuração; não tem cliente ou conexão. `api/health.ts` responde GET/HEAD sem
consultar banco. Nenhum endpoint financeiro ou driver foi implementado.

Fontes do levantamento:

- `src/types/finance.ts`: todas as interfaces, campos opcionais e projeções.
- `src/domain/financeRules.ts`: cálculo mensal, saldo encadeado, previsões,
  parcelas, snapshots e compatibilidade com fechamento legado.
- `src/domain/monthOperations.ts`: pagamento, fechamento, reabertura e proteção.
- `src/domain/history.ts`: total anual pago e parcelamentos ativos.
- `src/services/financeStorage.ts`: carga, gravação e dados de demonstração.
- `src/context/FinanceContext.tsx`: criação, edição, exclusão e atomicidade local.
- `src/components/AccountModal.tsx`, `CardPurchaseModal.tsx`, `PaymentDialog.tsx`,
  `PaymentOptions.tsx`, `SettingsModal.tsx`, `AccountCard.tsx` e
  `CreditCardAccountCard.tsx`: entradas e ações financeiras.
- `src/pages/AccountsPage.tsx`, `DashboardPage.tsx`, `HistoryPage.tsx`:
  agregação, pagamentos e ciclo de fechamento na interface.
- `src/utils/formatters.ts`: aritmética e representação dos meses.
- `tests/cardBalances.test.ts`, `tests/monthOperations.test.ts`: 36 cenários;
  scripts complementares `tests/browser-validation.cjs` e
  `tests/accounts-browser-validation.cjs`: fluxos de navegador e apresentação.
- `server/neon.ts`, `api/health.ts` (único arquivo de API), `README.md`,
  `package.json` e `vite.config.ts`: fronteira backend e comandos de validação.


## 2. Revisão da Etapa 2

Nenhuma tabela removida ou combinada: as 17 foram reavaliadas abaixo. O ganho de
simplicidade está em não materializar projeções, saldos ou parcelas futuras e em
não acrescentar um ledger de pagamentos fictícios. Cada tabela mantém uma
responsabilidade e um ciclo de vida verificável.

| Tabela mantida | Fonte de verdade / natureza | Por que manter separada; redundância e risco |
| --- | --- | --- |
| households | Identidade do núcleo e revisão de concorrência | Dados pertencem ao núcleo, não a um usuário; revision não é saldo |
| app_users | Identidade externa do usuário | Não confundir pessoa com núcleo ou criar login nesta etapa |
| household_memberships | Relação N:N e papel | Permissão varia por núcleo; não duplicar usuários por família |
| categories | Nome, cor, descrição | Referência opcional; snapshots congelam metadados antigos intencionalmente |
| credit_cards | Identidade do agregador | Saldo e total não são atributos do cartão |
| simple_accounts | Ocorrência, valor e estado do mês | Uma linha por conta, sem tabela de pagamento redundante |
| recurring_definitions | Identidade, início, atividade e metadados | Misturar valor aqui copiaria indevidamente o mês anterior |
| recurring_monthly_records | Valor informado e estado de uma ocorrência | Independência mensal; ausência é zero virtual, não nova linha automática |
| installment_purchases | Configuração vigente | Não persistir calendário futuro inteiro nem mês final calculável |
| installment_month_states | Estado e override mensal | Combina os dois maps atuais; não combinar com snapshot imutável |
| installment_month_snapshots | Fato histórico esparso congelado | Separado de pagamentos reversíveis; duplicação histórica deliberada |
| card_expenses | Componentes da fatura | Sem estado pago próprio; somá-los ao pago da fatura duplicaria despesa |
| card_monthly_invoices | Total pago acumulado e estado registrado | Não é total da fatura nem lista de parcelas de pagamento |
| financial_months | Ponteiro para fechamento oficial vigente | Permite mês reaberto sem apagar fechamento; MAX(revision) não substitui ponteiro |
| month_closures | Snapshot integral e versão | Não combinar com ponteiro mutável; não recalcular histórico |
| month_reopenings | Evento imutável de arquivamento | Evita editar o fechamento para marcar reabertura; tempo legado pode ser desconhecido |
| import_batches | Recibo imutável, evidência e backup lógico do lote | Idempotência e rastreabilidade; payload não é outra fonte operacional |

Mudanças relevantes em relação à Etapa 1:

- IDs próprios passam de text para **uuid nativo**, com mapeamento tipado por
  tabela através de source_import_id + legacy_id. Não é necessária tabela
  polimórfica de mapeamento; cada FK aponta a uma entidade real.
- Oito tabelas operacionais ganham archived_at. A exclusão lógica reproduz a
  retirada dos arrays sem apagar dados históricos. Não é cancelamento prospectivo:
  não inventa um mês final e não passa a manter a conta na projeção antiga aberta.
- sort_order nessas oito tabelas preserva a ordem dos arrays, inclusive prepend
  de simples e append de registros mensais atualizados. UUID não define ordem.
- Domains centralizam CHECKs de mês, valores e status; requiredness continua na
  coluna. Não há enum PostgreSQL de status.
- O lote registra hash bruto, hash canônico e classificação/evidências de origem.
  Distinguir demo de dado real exige análise e decisão explícita.
- closed_at fica nullable somente para fechamento importado com data inválida ou
  desconhecida; texto original permanece no payload. Novos fechamentos exigem
  data. captured_at e reopened_at também não recebem datas históricas inventadas.
- Proteção append-only agora consta como função/triggers no arquivo draft,
  inclusive para TRUNCATE. Não foi instalada em banco algum.
- Estados impossíveis locais de fatura explícita são restringidos, mantendo NULL
  legado e sem CHECK contra total derivado de outras linhas.
- Não foram adicionadas tabelas de saldo, resumo mensal, visão unificada,
  transações bancárias ou versões completas de configuração.

## 3. Matriz de mapeamento e relações

| FinanceDataStore atual | Tabela(s) finance_v2 | Natureza | Observações de migração |
| --- | --- | --- | --- |
| categories | categories | Persistido | UUID novo, legacy_id, ordem e metadados preservados |
| creditCards | credit_cards | Persistido | Agregador; não importar saldo como coluna |
| simpleAccounts | simple_accounts | Persistido | value → amount; mês, categoria opcional e status |
| recurringDefinitions | recurring_definitions | Persistido | Sem valor padrão mensal |
| recurringMonthlyRecords | recurring_monthly_records | Persistido | UNIQUE definição/mês; ausente continua virtual zero |
| installmentPurchases | installment_purchases | Persistido | Configuração vigente, início, vigência e base |
| installmentPurchases.statusByMonth / paymentAmountsByMonth | installment_month_states | Persistido | União das chaves dos maps; NULL preserva ausência individual |
| installmentPurchases.monthlySnapshots | installment_month_snapshots | Snapshot | Esparsos; não gerar meses futuros ou preencher histórico desconhecido |
| cardExpenses | card_expenses | Persistido | Compra interna sem pagamento próprio |
| cardMonthlyInvoices | card_monthly_invoices | Persistido | status → recorded_status; NULL paid_amount mantém inferência legada |
| closedMonths | financial_months + month_closures | Ponteiro + snapshot | Fechamento vigente; payload original e IDs embutidos não reescritos |
| closedMonthHistory | month_closures + month_reopenings | Snapshot + evento | Ordem do array vira revision; reabertura legada sem instante conhecido |
| UnifiedMonthlyAccount | Nenhuma tabela operacional | Derivado / snapshot no fechamento | Contas e itens internos são congelados em payload.accounts |
| MonthFinancialSummary | Nenhuma tabela operacional | Derivado / snapshot no fechamento | Resumo integral em payload.summary; anual soma somente vigente/aberto |

```text
app_users 1 ── N household_memberships N ── 1 households
households 1 ── N entidades financeiras e import_batches
categories 1 ── N simple_accounts / recurring_definitions /
                  installment_purchases / card_expenses (FKs opcionais)
credit_cards 1 ── N card_expenses / card_monthly_invoices
credit_cards 1 ── N installment_purchases (opcional; NULL = avulso)
recurring_definitions 1 ── N recurring_monthly_records
installment_purchases 1 ── N installment_month_states / installment_month_snapshots
financial_months 1 ── N month_closures
financial_months ── aponta para zero ou um month_closures do mesmo núcleo/mês
month_closures 1 ── 0..1 month_reopenings
import_batches 1 ── N entidades importadas / month_closures
app_users 1 ── N autoria opcional de importações, fechamentos e reaberturas
```

Todas as FKs financeiras incluem household_id. Referências de autoria apontam à
identidade global de usuário; associação ao núcleo no instante do comando deve
ser validada pelo serviço. Remover membership não apaga autoria. Identificadores
embutidos em snapshots não são FKs para cadastros vivos.

## 4. IDs, meses, dinheiro, status e convenções

**Identidade:** servidor/importador futuro gera UUID v4 e envia ao PostgreSQL;
nenhum DEFAULT de geração, extensão ou sequência é necessário. PKs das entidades
financeiras incluem household_id para isolamento estrutural. Estados/snapshots
de parcela e memberships usam chaves naturais compostas; fechamentos usam
(household_id, month, id) para permitir FK do ponteiro no mesmo mês. Não acrescentar
UUID artificial a uma ocorrência já identificada por compra/mês.

Em cada uma das oito tabelas com ID no store, source_import_id e legacy_id são
ambos NULL (novo cadastro) ou ambos preenchidos (importado).
UNIQUE(household_id, source_import_id, legacy_id) define o mapeamento dentro da
tabela e do lote. Exemplo: categories/cat_casa → UUID A, simpleAccounts/categoryId
cat_casa → FK A. O mesmo texto pode existir em outra tabela ou em outro núcleo.
Não usar hash do ID sozinho, nem presumir UUID nos IDs atuais.

Importador monta todo o mapa antes de resolver FKs. Maps mensais referenciam o UUID
da compra + mês; não possuem ID legado independente. Fechamentos são identificados
pela chave do mês, origem vigente/histórico e índice da revisão no lote.
Snapshots importados retêm IDs textuais originais; source_import_id do fechamento
ou da compra permite resolver sua origem. Se o cadastro já foi excluído, não
inventar uma linha: o identificador descritivo continua no payload/backup. Ao
adaptar snapshots e cadastros juntos, usar namespaces de IDs por versão/lote ou
traduzir apenas a cópia de leitura; nunca mutar a fonte congelada.

**Mês:** finance_v2.month_key é date com primeiro dia e intervalo
0001-01-01 a 9999-12-01. Ano/mês inválido falha no tipo date; dia diferente de 1,
infinity ou ano fora da faixa falha no CHECK. YYYY-MM ↔ YYYY-MM-01 sem fuso.
Timestamp só representa instantes reais de gravação, pagamento ou fechamento.
Não existe conceito de vencimento neste modelo.

**Dinheiro:** finance_v2.money_amount usa NUMERIC(15,2), faixa
0..9.999.999.999.999,99 e rejeita NaN. signed_money_amount usa a faixa simétrica
somente para manual_adjustment legado. Isso comporta 13 dígitos inteiros; cada
valor em centavos fica abaixo do inteiro seguro JS, mas somas exigem limite próprio.
API futura valida escala antes da conversão: NUMERIC(15,2) arredonda entradas
com mais casas. Strings decimais/centavos devem evitar cálculos binários financeiros.
Não redistribuir resíduos de parcelamento. [Tipos numéricos PostgreSQL](https://www.postgresql.org/docs/current/datatype-numeric.html).

**Status:** payment_status é text com CHECK de pendente/parcial/pago, mais simples
de evoluir que enum. Os tipos atuais admitem parcial também fora de cartão;
importação preserva esses legados e o serviço continua recusando NOVOS comandos
parciais fora de cartão. Em fatura com paid_amount explícito, pendente exige zero
e parcial exige positivo. Pago com zero é válido para quitação explícita de fatura
zero. Não exigir status igual ao estado exibido, nem paid_amount <= total em CHECK:
compras/edições posteriores podem alterar o total sem alterar pagamento registrado.

**Conjuntos comuns do dicionário:** nenhum campo implícito além dos listados aqui.

- **T**: created_at e updated_at, ambos timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP.
  O serviço atualiza updated_at explicitamente; não há trigger automático para isso.
  Datas createdAt válidas de origem são preservadas; datas ausentes/ inválidas são
  reportadas e permanecem no backup, não confundidas com o instante da importação.
- **E**: household_id uuid NOT NULL, id uuid NOT NULL, source_import_id uuid NULL,
  legacy_id text NULL, sort_order bigint NOT NULL, archived_at timestamptz NULL,
  mais T. PK(household_id,id), FK household RESTRICT, FK composta source_import_id
  para import_batches RESTRICT, UNIQUE(household_id,source_import_id,legacy_id),
  CHECK de nulidade conjunta e legacy_id não vazio quando presente.
- sort_order aceita negativos para prepend; não é chave ou valor financeiro.
  Importar índice do array; comandos posteriores reproduzem posição atual sob lock.
  Ler ORDER BY sort_order,id. Empates são determinísticos; preservação exata da
  ordem depende do serviço manter posições distintas. Não indexar ordenação pequena.
- Domains permitem NULL; cada coluna obrigatória tem NOT NULL próprio.
  Isso segue a recomendação de [CREATE DOMAIN](https://www.postgresql.org/docs/current/sql-createdomain.html).
- Todas as FKs têm ON UPDATE RESTRICT e ON DELETE RESTRICT. Não há SET NULL
  automático, CASCADE ou vínculo com tabela de public.

## 5. Dicionário exato da proposta SQL

As colunas E/T e respectivas constraints estão expandidas no SQL. Abaixo,
NULL indica opcional; “—” em default significa que não há default. Os CHECKs
dos domains da seção 4 aplicam-se a todas as colunas daquele tipo.

### 5.1 households

Núcleo financeiro e revisão de concorrência. Inclui **T**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| id | uuid | Não | — |
| name | text | Não | — |
| revision | bigint | Não | `0` |

Constraints:

- `PRIMARY KEY (id)`
- `CHECK (btrim(name) <> '')`
- `CHECK (revision >= 0)`

### 5.2 app_users

Identidade externa sem implementação de autenticação. Inclui **T**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| id | uuid | Não | — |
| auth_issuer | text | Não | — |
| auth_subject | text | Não | — |
| display_name | text | Sim | — |

Constraints:

- `PRIMARY KEY (id)`
- `UNIQUE (auth_issuer, auth_subject)`
- `CHECK (btrim(auth_issuer) <> '')`
- `CHECK (btrim(auth_subject) <> '')`

### 5.3 household_memberships

Participação e papel por núcleo. Inclui **T**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| household_id | uuid | Não | — |
| user_id | uuid | Não | — |
| role | text | Não | — |

Constraints:

- `PRIMARY KEY (household_id, user_id)`
- `FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (user_id) REFERENCES finance_v2.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `CHECK (role IN ('owner', 'editor', 'viewer'))`

### 5.4 import_batches

Recibo de importação concluída; imutável.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| household_id | uuid | Não | — |
| id | uuid | Não | — |
| source_key | text | Não | `'organizacao_financeira_store_v1'` |
| source_sha256 | text | Não | — |
| canonical_sha256 | text | Não | — |
| source_payload | jsonb | Não | — |
| source_classification | text | Não | — |
| classification_evidence | jsonb | Não | — |
| imported_by | uuid | Sim | — |
| imported_at | timestamptz | Não | `CURRENT_TIMESTAMP` |
| importer_version | text | Não | — |

Constraints:

- `PRIMARY KEY (household_id, id)`
- `FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (imported_by) REFERENCES finance_v2.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `UNIQUE (household_id, source_sha256)`
- `UNIQUE (household_id, canonical_sha256)`
- `CHECK (source_key = 'organizacao_financeira_store_v1')`
- `CHECK (source_sha256 ~ '^[0-9a-f]{64}$')`
- `CHECK (canonical_sha256 ~ '^[0-9a-f]{64}$')`
- `CHECK (jsonb_typeof(source_payload) = 'object')`
- `CHECK (jsonb_typeof(classification_evidence) = 'object')`
- `CHECK (source_classification IN ('empty', 'demo_match', 'user_confirmed', 'modified_demo', 'unknown'))`
- `CHECK (btrim(importer_version) <> '')`

### 5.5 categories

Cadastro opcional de classificação. Inclui **E**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| name | text | Não | — |
| color | text | Não | — |
| description | text | Sim | — |

Constraints adicionais a E:

- `CHECK (btrim(name) <> '')`

### 5.6 credit_cards

Identidade do cartão agregador. Inclui **E**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| name | text | Não | — |
| brand | text | Sim | — |
| color | text | Sim | — |

Constraints adicionais a E:

- `CHECK (btrim(name) <> '')`

### 5.7 simple_accounts

Conta de um mês; amount é o próprio valor pago quando status=pago. Inclui **E**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| name | text | Não | — |
| amount | money_amount | Não | — |
| month | month_key | Não | — |
| category_id | uuid | Sim | — |
| status | payment_status | Não | `'pendente'` |
| notes | text | Sim | — |

Constraints adicionais a E:

- `FOREIGN KEY (household_id, category_id) REFERENCES finance_v2.categories (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `CHECK (btrim(name) <> '')`

### 5.8 recurring_definitions

Definição permanente; não contém valor mensal. Inclui **E**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| name | text | Não | — |
| category_id | uuid | Sim | — |
| start_month | month_key | Não | — |
| is_active | boolean | Não | `true` |
| notes | text | Sim | — |

Constraints adicionais a E:

- `FOREIGN KEY (household_id, category_id) REFERENCES finance_v2.categories (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `CHECK (btrim(name) <> '')`

### 5.9 recurring_monthly_records

Ocorrência mensal independente; sem cópia automática de valores. Inclui **E**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| definition_id | uuid | Não | — |
| month | month_key | Não | — |
| amount | money_amount | Não | `0` |
| is_value_set | boolean | Não | `false` |
| status | payment_status | Não | `'pendente'` |
| notes | text | Sim | — |

Constraints adicionais a E:

- `FOREIGN KEY (household_id, definition_id) REFERENCES finance_v2.recurring_definitions (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `UNIQUE (household_id, definition_id, month)`
- `CHECK (is_value_set OR (amount = 0 AND status = 'pendente'))`

### 5.10 installment_purchases

Configuração vigente; fim e parcela corrente são derivados. Inclui **E**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| description | text | Não | — |
| total_amount | money_amount | Não | — |
| installments_count | integer | Não | — |
| start_month | month_key | Não | — |
| effective_from_month | month_key | Sim | — |
| base_installment_number | integer | Sim | — |
| credit_card_id | uuid | Sim | — |
| category_id | uuid | Sim | — |
| notes | text | Sim | — |

Constraints adicionais a E:

- `FOREIGN KEY (household_id, credit_card_id) REFERENCES finance_v2.credit_cards (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (household_id, category_id) REFERENCES finance_v2.categories (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `CHECK (btrim(description) <> '')`
- `CHECK (installments_count >= 1)`
- `CHECK (base_installment_number BETWEEN 1 AND installments_count)`

### 5.11 installment_month_states

Estado e valor corrigido mensal; não é um snapshot. Inclui **T**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| household_id | uuid | Não | — |
| purchase_id | uuid | Não | — |
| month | month_key | Não | — |
| status | payment_status | Sim | — |
| amount_override | money_amount | Sim | — |

Constraints:

- `PRIMARY KEY (household_id, purchase_id, month)`
- `FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (household_id, purchase_id) REFERENCES finance_v2.installment_purchases (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `CHECK (status IS NOT NULL OR amount_override IS NOT NULL)`

### 5.12 installment_month_snapshots

Ocorrência histórica imutável e esparsa.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| household_id | uuid | Não | — |
| purchase_id | uuid | Não | — |
| month | month_key | Não | — |
| current_installment | integer | Não | — |
| total_installments | integer | Não | — |
| remaining_installments | integer | Não | — |
| installment_amount | money_amount | Não | — |
| end_month | month_key | Não | — |
| description | text | Sim | — |
| category_id_snapshot | text | Sim | — |
| total_amount | money_amount | Sim | — |
| card_id_snapshot | text | Sim | — |
| card_assignment_known | boolean | Não | `false` |
| schema_version | integer | Não | — |
| captured_at | timestamptz | Sim | — |
| recorded_at | timestamptz | Não | `CURRENT_TIMESTAMP` |

Constraints:

- `PRIMARY KEY (household_id, purchase_id, month)`
- `FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (household_id, purchase_id) REFERENCES finance_v2.installment_purchases (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `CHECK (total_installments >= 1)`
- `CHECK (current_installment BETWEEN 1 AND total_installments)`
- `CHECK (remaining_installments = total_installments - current_installment)`
- `CHECK (end_month >= month)`
- `CHECK (schema_version IN (1, 2))`
- `CHECK (card_assignment_known OR card_id_snapshot IS NULL)`
- `CHECK (schema_version = 1 OR (description IS NOT NULL AND btrim(description) <> '' AND total_amount IS NOT NULL AND card_assignment_known AND captured_at IS NOT NULL))`

### 5.13 card_expenses

Componente interno, sem pagamento próprio. Inclui **E**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| card_id | uuid | Não | — |
| description | text | Não | — |
| amount | money_amount | Não | — |
| month | month_key | Não | — |
| category_id | uuid | Sim | — |

Constraints adicionais a E:

- `FOREIGN KEY (household_id, card_id) REFERENCES finance_v2.credit_cards (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (household_id, category_id) REFERENCES finance_v2.categories (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `CHECK (btrim(description) <> '')`

### 5.14 card_monthly_invoices

Total pago acumulado substitutivo, não total da fatura. Inclui **E**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| card_id | uuid | Não | — |
| month | month_key | Não | — |
| recorded_status | payment_status | Não | `'pendente'` |
| paid_amount | money_amount | Sim | — |
| manual_adjustment | signed_money_amount | Sim | — |
| paid_at | timestamptz | Sim | — |

Constraints adicionais a E:

- `FOREIGN KEY (household_id, card_id) REFERENCES finance_v2.credit_cards (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `UNIQUE (household_id, card_id, month)`
- `CHECK (paid_amount IS NULL OR recorded_status <> 'pendente' OR paid_amount = 0)`
- `CHECK (paid_amount IS NULL OR recorded_status <> 'parcial' OR paid_amount > 0)`

### 5.15 financial_months

Ponteiro vigente; ausência de ponteiro representa mês aberto. Inclui **T**.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| household_id | uuid | Não | — |
| month | month_key | Não | — |
| current_closure_id | uuid | Sim | — |

Constraints:

- `PRIMARY KEY (household_id, month)`
- `FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT`

FK adicional declarada após criação de month_closures: (household_id, month,
current_closure_id) → month_closures(household_id, month, id), MATCH SIMPLE,
ON UPDATE RESTRICT, ON DELETE RESTRICT. Não há flag closed redundante.

### 5.16 month_closures

Snapshot completo imutável, com versão e autoria opcional.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| household_id | uuid | Não | — |
| id | uuid | Não | — |
| month | month_key | Não | — |
| revision | integer | Não | — |
| closed_at | timestamptz | Sim | — |
| schema_version | integer | Não | — |
| rules_version | text | Não | — |
| payload | jsonb | Não | — |
| recorded_at | timestamptz | Não | `CURRENT_TIMESTAMP` |
| source_import_id | uuid | Sim | — |
| actor_user_id | uuid | Sim | — |

Constraints:

- `PRIMARY KEY (household_id, month, id)`
- `FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (household_id, month) REFERENCES finance_v2.financial_months (household_id, month) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (actor_user_id) REFERENCES finance_v2.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `UNIQUE (household_id, month, revision)`
- `CHECK (revision >= 1)`
- `CHECK (schema_version IN (1, 2))`
- `CHECK (btrim(rules_version) <> '')`
- `CHECK (source_import_id IS NOT NULL OR closed_at IS NOT NULL)`
- `CHECK (jsonb_typeof(payload) = 'object')`
- `CHECK ((jsonb_typeof(payload -> 'accounts') = 'array') IS TRUE)`
- `CHECK ((jsonb_typeof(payload -> 'summary') = 'object') IS TRUE)`
- `CHECK ((jsonb_typeof(payload -> 'closedAt') = 'string') IS TRUE)`
- `CHECK ((payload ->> 'month' = to_char(month, 'YYYY-MM')) IS TRUE)`
- `CHECK ((payload -> 'summary' ->> 'month' = to_char(month, 'YYYY-MM')) IS TRUE)`

### 5.17 month_reopenings

Evento de arquivamento imutável; uma reabertura por revisão.

| Campo | Tipo | NULL | Default |
| --- | --- | --- | --- |
| household_id | uuid | Não | — |
| month | month_key | Não | — |
| closure_id | uuid | Não | — |
| reopened_at | timestamptz | Sim | — |
| recorded_at | timestamptz | Não | `CURRENT_TIMESTAMP` |
| source | text | Não | — |
| actor_user_id | uuid | Sim | — |

Constraints:

- `PRIMARY KEY (household_id, month, closure_id)`
- `FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (household_id, month, closure_id) REFERENCES finance_v2.month_closures (household_id, month, id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `FOREIGN KEY (actor_user_id) REFERENCES finance_v2.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `CHECK (source IN ('command', 'legacy_import'))`
- `CHECK (source = 'legacy_import' OR reopened_at IS NOT NULL)`

## 6. Índices e fronteira de integridade

| Índice adicional | Colunas | Justificativa |
| --- | --- | --- |
| simple_accounts_month_idx | household_id, month | Grade e faixa anual |
| recurring_records_month_idx | household_id, month | Todas as ocorrências do mês |
| card_expenses_card_month_idx | household_id, card_id, month | Composição e cadeia do cartão |
| card_invoices_month_idx | household_id, month | Pagamentos de todos os cartões no mês |
| installments_card_idx | household_id, credit_card_id | Configurações por cartão |
| memberships_user_idx | user_id, household_id | Núcleos acessíveis ao usuário |

PK/UNIQUE já cobrem cartão+mês na fatura, definição+mês, compra+período nos states/
snapshots, mês+revisão de fechamento e meses por household para histórico anual.
Não criar índice isolado de status: filtros são aplicados ao conjunto mensal
pequeno, e status exibido do cartão é derivado. Não criar índice de mês final
calculado, GIN de snapshots, cor/booleanos ou duplicatas de PK/UNIQUE. A avaliação
de planos reais será posterior, sem EXPLAIN ou banco nesta etapa.

| Garantia | Responsável na proposta |
| --- | --- |
| Tipos exatos, mês válido, estados locais, ausência vs zero | Domains, NOT NULL e CHECK |
| Identidade, unicidade mensal e referências dentro do núcleo | PK, UNIQUE e FKs compostas |
| Snapshot/lote/evento não atualizado, excluído ou truncado | 4 triggers statement chamando reject_history_mutation |
| Payload possui accounts/summary/closedAt e mês correspondente | CHECKs estruturais em month_closures |
| Conteúdo profundo, versões, precisão JSON e total coerente | Validador futuro antes de inserir snapshot |
| Elegibilidade, mutação em mês fechado, total pago <= fatura no comando | Domínio futuro sob transação e lock |
| Ponteiro nunca aponta revisão reaberta, revisão crescente, evento de arquivo obrigatório | Comandos transacionais futuros |
| Só membros autorizados leem/escrevem | Serviço e permissões/RLS futuros; FKs não autorizam acesso |

A função no draft apenas lança erro para UPDATE/DELETE/TRUNCATE das quatro tabelas
imutáveis (snapshots de parcela, fechamentos, reaberturas e lotes); não implementa
pagamento nem ciclo mensal. É SECURITY INVOKER, search_path=pg_catalog e não
executa SQL dinâmico. Triggers não substituem privilégios: owner pode desabilitá-los.
[CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html).

CHECKs não consultam outras linhas para calcular saldo. O SQL sozinho não bloqueia
toda edição em mês fechado ou transição indevida do ponteiro. A aplicação atual
continua protegida pelo domínio existente; a integração futura NÃO poderá ser
publicada sem implementar e testar os protocolos abaixo. A proposta não afirma
que um DDL isolado substitui essas regras.

## 7. Exclusão, arquivamento e leitura compatível

Todas as FKs são RESTRICT; exclusão ordinária das oito entidades E usa archived_at
sob transação, mantendo IDs legados e dependentes para auditoria. O adaptador
futuro monta o store apenas com linhas não arquivadas, e também filtra filhos de
pais arquivados. Esse filtro deve ser aplicado antes de cálculos e saldos.

| Entidade | Comando futuro que reproduz a exclusão atual |
| --- | --- |
| Categoria | Limpar category_id nas entidades vivas e arquivar categoria; snapshot não muda |
| Conta simples | Arquivar somente a ocorrência, se mês aberto |
| Definição fixa | Arquivar definição e registros dependentes; bloquear se algum registro mensal afetado é fechado |
| Registro fixo | Arquivo junto da definição; UNIQUE continua reservado e impede duplicação da ocorrência |
| Compra parcelada | Arquivar compra; conservar states/snapshots, omitidos do store operacional; nenhuma parcela histórica física apagada |
| Cartão | Arquivar cartão, despesas e faturas; desvincular compras parceladas vivas como no código; bloquear registros mensais fechados afetados |
| Despesa de cartão | Arquivar ocorrência se mês aberto |
| Fatura mensal | Reversão altera pagamento; arquivo só no comando de remoção de cartão permitido |
| Usuário/membership | Remoção de participação explícita; autoria não é removida; FK de usuário RESTRICT |
| Household/fechamento/snapshot/lote | Sem exclusão ordinária; nenhum cascade ou expurgo nesta etapa |

Arquivo não é um novo estado de pagamento e não é “cancelar a partir deste mês”.
A projeção aberta perde a entidade como hoje quando ela sai do array. Fechamentos
oficiais permanecem integralmente congelados. Para futuras restaurações de linhas,
reusar a ocorrência reservada, nunca contornar UNIQUE; restauração não faz parte
da funcionalidade atual. Archive de definições/compras não autoriza reescrever
snapshots oficiais. Referências históricas de cartão/categoria são texto descritivo,
sem FK que obrigue apagar ou atualizar história quando o cadastro mudar.

Categoria retirada de linha mensal fechada continua sendo a exceção de
assertFinancialMutation; os demais atributos financeiros dessa linha não mudam.
No futuro, não dar DELETE/TRUNCATE indiscriminado à role da aplicação. Backups e
retenção poderão exigir expurgo administrativo separado, nunca em cascade.

## 8. Persistidos, derivados e congelados

| Classe | Conteúdo | Decisão |
| --- | --- | --- |
| Persistido operacional | Cadastros, compras, valores mensais informados, overrides e pagamentos acumulados | Colunas relacionais |
| Derivado aberto | UnifiedMonthlyAccount, CardInternalItem, MonthFinancialSummary, previsão, anual, status exibido do cartão, saldo transportado | Funções do domínio; sem tabelas normais |
| Derivado de parcela | Número atual, restante, valor mensal e mês final | Calcular da vigência, salvo snapshot prioritário |
| Histórico congelado | Contas e resumo completos no fechamento; parcelas anteriores a edição | JSONB versionado e linhas de snapshot |

`previousPendingInvoices` é atualmente zero ou um item sintético associado ao mês
imediatamente anterior ao consultado, não uma lista de dívidas originais. Não
persistir seus itens como novas despesas. Contadores, percentuais e categorias do
resumo aberto são projeções; em fechamento são preservados mesmo se o algoritmo
futuro mudar. Não criar tabelas de UnifiedMonthlyAccount ou MonthFinancialSummary.

## 9. Regras mensais e estados de pagamento

Conta simples pertence a um mês. Conta fixa aparece quando ativa e mês >= início;
registro ausente resolve para amount=0, is_value_set=false, pendente, sem escrever
no banco durante leitura. Quando necessário, inserir somente o registro do mês
alvo; não copiar valor de mês anterior. Criar fixa com initialValue=0 hoje marca
isValueSet=false; informar/pagar zero depois pode marcar true.

Pagamento não cartão aceita pago/pendente. Correção ao pagar simples/fixa altera
o valor daquela ocorrência; em parcela avulsa grava amount_override. Reversão
mantém o valor corrigido. Parcela de cartão não tem pagamento independente.
Comando repetido que já tem o mesmo estado não corrige novamente uma conta
simples/fixa/avulsa. Para cartão, total explícito pode substituir total anterior.

`paid_at` existe apenas na fatura atual; não inventar datas de pagamento nas
demais tabelas. Não converter estados em uma lista fictícia de pagamentos.

## 10. Cartão, pagamento e saldo anterior

Para cada household/cartão, percorrer meses relevantes em ordem (despesas,
parcelas ativas, faturas registradas e fechamentos vigentes). Incluem meses de
outros anos e lacunas sem compras. Sendo C compras/parcelas próprias do mês,
B saldo consolidado de entrada e P total pago no mês:

```text
total da fatura = arredondar(C + B, 2)
saldo de saída = arredondar(max(0, total da fatura - P), 2)
entrada do próximo mês relevante = somente esse saldo de saída
```

| Mês | Compras C | Entrada B | Total | Pago P | Saída |
| --- | ---: | ---: | ---: | ---: | ---: |
| Agosto | 1.000,00 | 0,00 | 1.000,00 | 900,00 | 100,00 |
| Setembro | 1.900,00 | 100,00 | 2.000,00 | 1.500,00 | 500,00 |
| Outubro | 0,00 | 500,00 | 500,00 | 0,00 | 500,00 |

Outubro recebe 500, nunca 600. Quitação integral de setembro registra P=2.000,
absorvendo o saldo anterior. Após um parcial de 1.500, quitar substitui o acumulado
por 2.000; não registra P=500. Pagamentos parciais repetidos são totais acumulados
substitutivos (900 → 950), não incrementos (900 + 950). Reversão grava zero e
remove paid_at. Serviço deve conferir total novamente dentro da transação.

Estado exibido: pago quando saída=0 e (P>0 ou recorded_status='pago'); parcial
quando P>0 com saldo aberto; nos demais casos pendente. Fatura zero não é paga
automaticamente: pode exigir a marcação explícita, como hoje.

Compatibilidade obrigatória:

- paid_amount NULL: status registrado pago significa pagamento somente das
  compras próprias C; outros estados inferem zero. Não presumir quitação de B.
- Fechamento vigente com cardInfo.paidAmount presente: seu totalOpenAmount é o
  saldo autoritativo de saída e substitui o acumulador, sem somar dívidas novamente.
- Fechamento legado sem paidAmount: usar currentMonthAmount (ou amount) congelado
  e inferir pagamento apenas dessas compras quando status pago; manter a dívida
  anterior. A projeção operacional especial não modifica o snapshot oficial.
- manualAdjustment hoje não é lido pelo cálculo: manter inerte.
- Compras após pagamento podem tornar a fatura parcial. Reduções posteriores
  podem deixar P acima do total; o código limita saldo a zero e mantém P. Não
  reduzir pagamento silenciosamente na migração; registrar risco para revisão.

Não persistir saldo de entrada/saída em faturas abertas nesta etapa de projeto:
isso criaria segunda fonte de verdade. Eventual cache futuro deverá ser invalidado
por alterações em qualquer mês anterior e jamais utilizado como novo lançamento.

## 11. Histórico anual

Total gasto = soma de summary.totalPaid dos 12 meses. Mês fechado usa apenas seu
snapshot vigente; mês aberto usa projeção atual. Fechamentos arquivados nunca
participam da soma. Contas não pagas não entram; cartão entra pelo total pago,
sem somar itens internos nem saldo anterior novamente. No exemplo anterior,
agosto+setembro somam 2.400 pagos, e outubro sem pagamento contribui zero.

categoryBreakdown não é uma distribuição de dinheiro pago: soma itens próprios e
valores das contas, inclusive pendentes. Não usá-lo para produzir total anual
pago nem ratear saldo anterior entre categorias. Valores por categoria podem
somar menos que totalExpected, que inclui saldo transportado.

## 12. Parcelamentos e preservação anterior à edição

Ordem atual: snapshot do mês, se existe, tem prioridade; senão effectiveFromMonth
ou startMonth define início da vigência, e baseInstallmentNumber ou 1 define base.
Atual = base + diferença mensal; ativo entre 1 e total; término = vigência +
(total-base) meses; parcela = arredondar(totalAmount/quantidade, 2).
Não distribuir automaticamente resíduos de centavos: 100/3 gera 33,33 por mês,
e não uma última parcela de 33,34. Corrigir uma ocorrência paga também não
redistribui diferença às demais.

Edição deve congelar ocorrências ativas anteriores ao mês alvo que ainda não têm
snapshot, preservar snapshots existentes e maps de pagamento, e só então gravar
nova vigência/configuração. Tudo na mesma transação. O código atual limita o laço
de captura a 120 meses; não transformar esse limite acidental em CHECK no banco.

O modelo mantém a configuração corrente com snapshots mensais esparsos, sem
materializar todas as parcelas futuras. Uma tabela de versões completas seria
alternativa para alterações retroativas complexas, mas não é necessária para
reproduzir a estratégia atual. Antes de liberar alterações de associação a cartão,
o resolver futuro terá de respeitar card_assignment_known dos novos snapshots.
Isso preserva associação histórica; não deve ser habilitado disfarçado de simples
troca de armazenamento, pois o resolver atual filtra pelo cartão vigente.

## 13. Snapshots, versões e instantes desconhecidos

Fechamento é autossuficiente: payload guarda month, closedAt, accounts e summary
integrais, com nomes, categorias/cores, notas, parcelas, itens internos, valores,
pagamentos, saldo, contadores e percentuais. Sem joins com cadastro vivo para
reconstruir o retrato. Payloads importados schema_version=1 retêm chaves ausentes,
valores e IDs originais. rules_version='legacy-unknown' quando desconhecida.
Não exigir que resumo antigo satisfaça regras posteriores de saldo.

Para novas capturas, schema_version=2 usa strings decimais canônicas nos campos
monetários do JSON; contadores e percentuais continuam números. O adaptador da
versão converte uma cópia para o domínio atual, com validação de faixa/precisão.
Não converter payload versão 1 no lugar. Datas internas closedAt válidas devem
corresponder a closed_at; serviço valida sem perder texto original. Importado com
data vazia/inválida mantém closed_at NULL, evidência no lote e payload original.
Nova captura sem source_import_id exige closed_at preenchido no SQL.

Snapshot de parcela preserva occurrence month, número, quantidade, restante,
valor mensal e fim, além dos opcionais históricos. category_id_snapshot e
card_id_snapshot são IDs textuais sem FK: versão 1 usa namespace legado; versão 2
usa UUID serializado. Versão 1 permite nome/total ausentes e captured_at NULL.
Versão 2 exige nome/total, associação conhecida e captured_at; categoria NULL
significa explicitamente sem categoria, não fallback vivo. card_assignment_known
true + card_id_snapshot NULL significa avulso conhecido; false significa dado
histórico não disponível. recorded_at marca gravação/importação, não captura.
Os snapshots legados de parcela são rastreáveis pelo lote da compra.

Month_reopenings usa source=legacy_import e reopened_at NULL quando apenas a
posição no array histórico existe. Novos eventos exigem reopened_at. Não inferir
hora de reabertura a partir de closedAt. Actor é opcional, e não se inventa autoria
para dado anterior à autenticação. O importador validará coerência entre source,
lote do fechamento e natureza legada, além das constraints locais do draft.

## 14. Operações transacionais futuras

Nenhuma API ou transação foi implementada nesta etapa. Protocolo recomendado:
obter lock de households, validar membership e revision esperada, ler estado
financeiro coerente, aplicar as funções do domínio, persistir o conjunto, atualizar
updated_at pertinente e incrementar revision uma vez no commit. Todos os comandos
de escrita usam o mesmo lock, inclusive categoria, arquivamento e importação.
READ COMMITTED após obter o lock permite ler o último commit; leituras compostas
fora de escrita precisam de snapshot consistente. Conflito de revisão exige
recarregar/recalcular; não sobrescrever silenciosamente comando concorrente.

| Operação | Registros que devem mudar atomicamente |
| --- | --- |
| Criar fixa | recurring_definitions + registro inicial do mês + revision |
| Registrar/corrigir pagamento simples | simple_accounts.amount/status/updated_at + revision |
| Registrar/corrigir pagamento fixa | upsert único de recurring_monthly_records (amount, is_value_set=true, status, ordem) + revision |
| Registrar/corrigir pagamento avulso | installment_month_states.status/amount_override + revision; configuração não redistribuída |
| Parcial de cartão | Recalcular cadeia sob lock, validar total, substituir card_monthly_invoices.paid_amount/recorded_status/paid_at/ordem + revision |
| Integral de cartão | Mesma fatura: substituir acumulado pelo total incluindo saldo anterior, nunca inserir “pagamento do saldo” separado + revision |
| Reversão | Estado pendente; cartão zera pago e limpa paid_at; demais preservam amount/override + revision |
| Fechar mês | Validar todas pagas e fixas informadas; financial_months, novo month_closures e ponteiro + revision |
| Reabrir | month_reopenings para revisão vigente + limpar ponteiro de financial_months + revision; dados/payload não mudam |
| Novo fechamento | Novo month_closures com próxima revision + novo ponteiro + revision do household; anteriores/eventos intocados |
| Editar parcelamento | Capturar somente snapshots anteriores necessários ainda ausentes + atualizar configuração/vigência/base + revision; states intocados |
| Arquivar/remover cadastro | Todas as linhas/desvinculações da seção 7 + revision, depois de validar meses afetados |
| Importar localStorage | import_batches, cadastros/mapeamentos UUID, filhos, states/snapshots, meses/revisões/eventos/ponteiros + revision |

Primeiro fechar cria mês com ponteiro NULL, insere fechamento, depois aponta para
ele; FKs circulares não exigem desabilitar integridade. Revision do fechamento é
monotônica por núcleo/mês sob lock; não é timestamp. O serviço só aponta para a
nova revisão criada e só limpa ponteiro ao registrar a reabertura correspondente.
Nunca selecionar vigente por MAX(revision). Evento de reabertura e ponteiro para
a mesma revisão não podem coexistir após commit. Essas invariantes entre linhas
são responsabilidade do protocolo futuro; a FK garante identidade/núcleo/mês.

Mês vazio pode ser fechado, fatura zero não paga automaticamente e parcial
bloqueia fechamento, como hoje. Clique repetido deve respeitar idempotência de
pagamento; fechar/reabrir em estado inválido continua falhando. Retentativa após
resultado de commit incerto deve consultar revisão/estado antes de reaplicar.
Não usar updated_at como chave de idempotência.

Alterações mensais fechadas continuam bloqueadas. Reabrir agosto não reabre
setembro: seu snapshot permanece autoritativo. Meses abertos posteriores recalculam
cadeia; fechados posteriores não são reescritos. Reconciliação entre revisões
fechadas exige decisão de produto separada, não uma “correção” da migração.

## 15. Household, usuários e permissões futuras

Dados são do household, usuários entram por memberships N:N. Identidade externa
usa UNIQUE(auth_issuer,auth_subject), sem senha/Clerk/login nesta etapa. A tabela
pode ficar vazia até existir autenticação; núcleo não exige usuário fictício.

Planejar role específica, por exemplo contas_tatu_app, **sem owner, superuser,
BYPASSRLS, CREATEDB, CREATEROLE, DDL ou TRUNCATE**. Role de migration separada,
mantida fora da aplicação. Nenhuma role/permissão foi criada ou alterada, nem
credencial foi usada nesta tarefa.

Privilégios futuros: CONNECT ao banco necessário; USAGE somente em finance_v2 e
tipos necessários; SELECT e DML mínimo nas tabelas operacionais; somente SELECT/
INSERT nos fechamentos, eventos e snapshots; import_batches acessível ao processo
de importação autorizado, sem permitir ao cliente sobrescrever evidência.
Atualização de identidade, memberships, IDs, origem de importação e ponteiros deve
passar por comandos internos autorizados, não endpoint genérico de tabela.
A role não terá grants nas tabelas legadas de public, nem membership herdada de
role que os possua; revisar também privilégios efetivos recebidos via PUBLIC.
Não revogar ou alterar permissões de tabelas legadas como efeito desta migration.

Antes de expor API: autorização por membership em toda operação e RLS com
contexto definido pelo backend, sem aceitar household_id do cliente como prova
de acesso; isolamento testado entre dois núcleos. Ausência de contexto deve negar
acesso. Nunca compartilhar conexão/session context entre usuários sem escopo
transacional controlado. Este draft não cria policies, grants ou conexão. A função
de imutabilidade é invoker e sua permissão será restrita no provisionamento futuro.
Chave composta protege integridade, não sigilo. Não expor API pública temporária
com household global.

## 16. Plano refinado de migração do localStorage

A chave é organizacao_financeira_store_v1. O carregador atual cria demo quando não
encontra dado utilizável: o importador deverá ler a chave bruta ANTES de chamar
loadFinanceStore/resetFinanceStore. Nada de migração ou coleta de dados reais foi
executado nesta etapa. Os testes de navegador usam perfis descartáveis próprios.

| Situação detectada | Classificação/evidência | Decisão futura antes de importar |
| --- | --- | --- |
| Chave ausente | Instalação sem dado | Não chamar seed nem criar lote financeiro; iniciar núcleo vazio se solicitado |
| JSON válido com coleções vazias | empty | Mostrar resumo vazio, confirmar intenção; não tratar como falha |
| Conteúdo igual a um default conhecido | demo_match + versão/hash do default | Informar correspondência, solicitar escolha manter/importar ou iniciar vazio |
| IDs/defaults presentes com alterações | modified_demo + diferenças | Tratar como potencial dado real; mostrar o conjunto inteiro e não descartar “restos de demo” automaticamente |
| Dado sem origem comprovável | unknown | Validar e pedir classificação/decisão; desconhecido nunca significa descartável |
| Usuário confirma dados próprios | user_confirmed + evidência da confirmação | Importar somente após validar e revisar contagens/totais |
| JSON inválido/incompleto | Falha pré-importação | Preservar bytes, emitir relatório, não resetar, não inserir lote de sucesso |

Não é possível provar intenção de uso apenas por nomes/IDs ou igualdade com seed.
Comparar com versões conhecidas de defaults, mantendo distinção entre observação
automática e escolha do usuário. classification_evidence registra classificador/
versão, default comparado, resumo das diferenças, decisão e instante; estrutura
profunda é validada pelo importador, não por um CHECK genérico de JSON.
Campos/valores alterados no demo podem ser reais. Nada é removido automaticamente.

Sequência futura:

1. Exportar bytes originais e SHA-256 para backup seguro; revisar household destino.
   Criar hash canônico do JSON validado (ordem de chaves normalizada, arrays e
   distinções de ausente/NULL preservados). SHA bruto preserva origem; canônico
   evita reimportar o mesmo conteúdo apenas reformatado.
2. Validar todos os arrays/maps, status, meses, dinheiro, timestamps, FKs e duplicatas.
   Checar contagens mensais únicas, chaves de fechamento/summary coerentes e
   snapshots. Dados inválidos ficam em relatório/backup até resolução aprovada.
   Datas desconhecidas de fechamentos importados têm caminho NULL documentado;
   createdAt inválido operacional exige decisão explícita, não data histórica falsa.
3. Classificar origem com resumo revisável de contagens, valores pagos/pendentes,
   meses e diferenças do demo. Se optar por começar vazio, manter backup e não
   registrar conteúdo ignorado como importado.
4. Planejar UUIDs e mapa por entidade/lote, traduzir somente FKs operacionais e
   preservar IDs textuais de snapshots. Guardar sort_order dos oito arrays.
5. Simular sem banco e reconstruir store comparável: projeções mensais até término
   de parcelas/última quitação, anuais, snapshots e reabertura. Canonicalizar somente
   para comparação, sem esconder diferenças de paidAmount ausente vs zero.
6. Importar numa única transação autorizada. Criar recibo de sucesso e todos os
   registros juntos. Histórico do array recebe revisões na ordem original; o
   fechamento vigente, se houver, recebe a revisão seguinte e o ponteiro.
   Se só há histórico, ponteiro fica NULL. Não deduplicar revisões por closedAt
   ou por payload igual: são eventos distintos.
7. UNIQUE(household,source_sha256) e UNIQUE(household,canonical_sha256) tornam
   reenvio do mesmo lote idempotente. Repetição retorna recibo/mapa existente.
   Hash diferente não autoriza merge: importação inicial em núcleo não vazio deve
   ser bloqueada até existir plano explícito de conciliação. IDs de defaults
   repetidos em navegadores distintos não autorizam unir famílias.
8. Ler e conferir contagens, conteúdo e totais; só depois trocar fonte ativa.
   Backup local permanece. Evitar duas fontes graváveis. Falha pré-commit desfaz
   lote inteiro; rollback depois de uso real exige exportar alterações posteriores.

source_payload é cópia JSONB imutável para auditoria, sem ser fonte viva; bytes
originais ficam no backup externo para conferir source_sha256, pois JSONB não
preserva formatação. imported_at é instante do recibo. importer_version torna
transformações reproduzíveis. Nenhum dado demo é inserido pelo draft SQL.

## 17. Riscos e decisões ainda necessárias

- Snapshots legados de parcela não guardam cartão e podem omitir nome/categoria/
  total. Preservar desconhecido; não inferir história que não existe.
- A edição atual captura no máximo 120 meses; há teste de saldo com 130 parcelas.
  O schema não impõe teto 60/120. Corrigir captura ou associação histórica será
  alteração de domínio separada, com testes, não disfarçada de migração.
- Edição retroativa com snapshot existente dá prioridade ao snapshot; troca de
  cartão usa vínculo vigente no resolver atual. O modelo guarda contexto futuro,
  mas não ativa outra regra nesta etapa.
- paidAmount ausente infere pagamento só das compras próprias quando pago.
  manualAdjustment segue inerte. Não normalizar NULL em zero.
- Reduzir compras após pagar pode deixar pagamento maior que total, com saída zero.
  Não inventar crédito/estorno; CHECK não compara com soma mutável.
- Reabertura anterior a mês fechado posterior preserva fotografia posterior.
  Reconciliação exige decisão independente.
- Arredondamento decimal pode divergir de number em casos limítrofes; paridade de
  centavos precisa ser comprovada antes da integração.
- Arquivamento requer filtro completo de pais/filhos e recomposição do store;
  esquecer linhas arquivadas pode ressuscitar dívidas. Validar em integração futura.
- Restam implementação/revisão de autenticação/autorização, RLS/grants, transações,
  validadores profundos, política de retenção/expurgo e testes de concorrência.
- A versão PostgreSQL real não foi consultada. O draft usa recursos documentados,
  sem UUID v7, extensão ou dependência de provedor. Execução e teste em banco só
  numa etapa futura explicitamente autorizada.

## 18. Validação e escopo da entrega

O SQL é revisado apenas como texto: dependências, tipos das FKs, alvos PK/UNIQUE,
nulabilidade, constraints, índices, schema exclusivo e correspondência com este
dicionário. Nenhum parser conectado a PostgreSQL, psql, migration runner, container
de banco ou conexão Neon foi usado.

Resultados da etapa 2 em 23/09/2026:

- `npm test`: 36 testes, 36 aprovados, zero falhas.
- `npm run lint`: aprovado; TypeScript frontend/configuração e backend
  (`tsc --noEmit && tsc -p tsconfig.server.json`). Não existe ESLint separado.
- `npm run build`: aprovado; 1.701 módulos transformados.
- `tests/browser-validation.cjs`: aprovado; 7 grupos de fluxos, 4 resoluções,
  incluindo pagamentos, bloqueios, fechamento, reabertura, reload e histórico anual.
- `tests/accounts-browser-validation.cjs`: aprovado; 5 grupos de fluxos, 4
  resoluções, incluindo o exemplo 1.000/900 → 2.000/1.500 → saldo 500 e legado.
- Scripts de navegador executados com Playwright já disponível no runtime,
  Edge headless e perfis descartáveis contra Vite local; nenhuma dependência
  instalada. Relatórios/capturas ficam fora do repositório, na área de artefatos.
- Vite precisou de execução autorizada fora do sandbox por bloqueio de leitura
  do esbuild; isso não envolveu API, conexão ou credenciais de banco.
- Revisão estática/manual: 17 tabelas, 4 domains, 41 FKs (40 inline e 1 do
  ponteiro), tipos/alvos e ordem de dependências conferidos; 6 índices adicionais
  sem duplicação de PK/UNIQUE; 4 triggers de imutabilidade e cabeçalhos conferidos.
  Inspeção textual auxiliar não é execução SQL nem validação pelo motor PostgreSQL.
- `git diff --check`: sem erros. Diff restrito aos dois arquivos desta etapa.

A entrega altera apenas este documento e cria o SQL draft. Nenhum arquivo de
runtime financeiro, interface visual, dependência ou configuração foi alterado.
Nenhuma estrutura de public, inclusive public.Contas e public.Controle_Contas,
foi acessada ou tocada. A etapa encerra no draft revisável, antes da Etapa 3.
