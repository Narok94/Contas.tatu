# Projeto do banco finance_v2 — etapa 1

Status: proposta para revisão, sem integração ou execução de SQL. Análise em
23/09/2026 sobre o código da revisão `e0c261b`. O comportamento do domínio atual
é a referência de compatibilidade. Todas as tabelas aqui propostas pertencem
exclusivamente a `finance_v2`. Não há dependência de tabelas de `public`.

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

O arquivo previamente não rastreado `HISTORY-SIMPLIFICATION-REVIEW.md` não faz
parte desta entrega e não foi alterado nem incluído no commit.

## 2. Mapa completo FinanceDataStore → banco

| Estrutura atual | Destino proposto | Transformação |
| --- | --- | --- |
| categories | categories | Cadastro por household; categoria ausente continua opcional |
| creditCards | credit_cards | Cadastro agregador, sem vencimento |
| simpleAccounts | simple_accounts | Uma ocorrência no mês; valor e estado persistidos |
| recurringDefinitions | recurring_definitions | Definição global, início e atividade |
| recurringMonthlyRecords | recurring_monthly_records | Uma linha por definição/mês; ausência gera zero virtual |
| installmentPurchases | installment_purchases | Configuração vigente e identidade da compra |
| installmentPurchases.statusByMonth | installment_month_states | Estado mensal avulso, ausência equivale a pendente |
| installmentPurchases.paymentAmountsByMonth | installment_month_states.amount_override | Valor mensal corrigido, inclusive após reversão |
| installmentPurchases.monthlySnapshots | installment_month_snapshots | Uma ocorrência congelada anterior à edição |
| cardExpenses | card_expenses | Compra interna vinculada ao cartão e ao mês |
| cardMonthlyInvoices | card_monthly_invoices | Total pago acumulado e intenção/estado registrado; não o total calculado da fatura |
| closedMonths | financial_months.current_closure_id → month_closures | Ponteiro para fechamento oficial vigente |
| closedMonthHistory | month_closures + month_reopenings | Revisões anteriores preservadas e evento de arquivamento |

Novas entidades de infraestrutura: `households`, `app_users`,
`household_memberships`, `financial_months` e `import_batches`. Não há uma tabela
global de contas polimórficas nem ledger de pagamentos individuais: o produto
atual registra estados e totais mensais, não transações bancárias individuais.

## 3. Diagrama textual de relações

```text
app_users 1 ── N household_memberships N ── 1 households
households 1 ── N [todas as entidades financeiras abaixo]
categories 1 ── N simple_accounts / recurring_definitions /
                  installment_purchases / card_expenses (vínculos opcionais)
recurring_definitions 1 ── N recurring_monthly_records
credit_cards 1 ── N card_expenses / card_monthly_invoices
credit_cards 1 ── N installment_purchases (opcional: ausência = avulso)
installment_purchases 1 ── N installment_month_states
installment_purchases 1 ── N installment_month_snapshots
financial_months 1 ── N month_closures
financial_months 0..1 ── 1 month_closures (current_closure_id, mesmo mês)
month_closures 1 ── 0..1 month_reopenings
households 1 ── N import_batches
```

Snapshots contêm identificadores históricos descritivos, sem FK para cadastros
vivos. Assim, excluir/renomear um cadastro não destrói a representação fechada.

## 4. Convenções, dinheiro e tipos

Todos os nomes de objetos deverão ser qualificados por `finance_v2`; não usar
`search_path` para escolher silenciosamente outro schema. Nenhuma tabela, função,
sequência ou FK deste projeto aponta para `public.Contas`, `public.Controle_Contas`
ou qualquer outra estrutura legada.

As listas de campos da seção 5 são exaustivas juntamente com os conjuntos comuns
abaixo. `?` significa NULL permitido; todos os demais campos são NOT NULL.

- **H**: `household_id uuid`, FK para households(id), exclusão RESTRICT.
- **E**: H + `id text`, PK composta `(household_id, id)`. Preserva IDs atuais
  (`cat_casa`, `inv_...`, etc.), evitando remapeamento dentro dos snapshots.
  Novos IDs podem ser UUIDs serializados como texto, gerados pelo servidor futuro.
- **T**: `created_at timestamptz`, `updated_at timestamptz`; padrão de inserção
  no servidor, atualização explícita em cada comando. `createdAt` válido existente
  é preservado, não substituído pela hora da importação. Campos novos recebem o
  instante da importação. T não é um histórico de auditoria.
- **M**: `date` limitado ao primeiro dia do mês, anos 0001–9999, com CHECK
  equivalente a `extract(day from campo) = 1` e intervalo explícito de datas.
  O adaptador transforma YYYY-MM em YYYY-MM-01 e vice-versa sem conversão de fuso.
  Trata-se de competência, nunca vencimento. Nenhum `due_date` será introduzido.
- **D**: `numeric(15,2)`, entre 0 e 9.999.999.999.999,99 e diferente de NaN.
  CHECK de faixa finita em cada coluna; nullable permite apenas NULL ou valor
  válido. Para ajuste legado assinado, faixa simétrica e exclusão explícita de NaN.
- **S**: `text` com CHECK em `('pendente','parcial','pago')`. Para novos comandos
  não cartão, aceitar apenas pendente/pago no serviço. Manter S na importação
  permite preservar estados legados que a interface TypeScript admite.

NUMERIC/DECIMAL são exatos; PostgreSQL pode arredondar entradas com escala maior
que a declarada. Por isso a futura API deve rejeitar mais de duas casas ANTES
de converter/inserir e usar strings decimais ou aritmética de centavos; nunca
`real`/`double precision` para dinheiro. A documentação oficial também descreve
NaN e o comportamento de arredondamento. [Referência PostgreSQL](https://www.postgresql.org/docs/current/datatype-numeric.html).

A precisão proposta comporta 13 dígitos inteiros e mantém cada valor em centavos
abaixo de Number.MAX_SAFE_INTEGER. Somatórios também precisam de controle de
limite antes de voltar a `number`; a precisão individual não garante a soma.
Valores legados fora da faixa, negativos ou fracionados além dos centavos exigem
revisão, nunca correção silenciosa. BRL é a única moeda desta etapa.

## 5. Tabelas e dicionário de campos

### 5.1 households

`id uuid PK`, `name text`, T, `revision bigint DEFAULT 0 CHECK >= 0`.
Nome não vazio. Revision é incrementada uma vez por comando financeiro confirmado
e usada para detectar clientes desatualizados. Não existe household global fixo.

### 5.2 app_users

`id uuid PK`, `auth_issuer text`, `auth_subject text`, `display_name text?`, T.
UNIQUE(auth_issuer, auth_subject), ambos não vazios. Identidade independente do
provedor; nenhuma senha, sessão ou dependência de Clerk. Tabela pode permanecer
vazia enquanto não existir autenticação; household não exige um usuário fictício.

### 5.3 household_memberships

H, `user_id uuid FK app_users(id)`, `role text`, T.
PK(household_id, user_id), CHECK role IN ('owner','editor','viewer').
Exclusão do usuário RESTRICT até remoção explícita de vínculos. A regra de manter
pelo menos um owner quando o household tiver membros exige serviço transacional.

### 5.4 categories

E, `name text`, `color text`, `description text?`, T.
Sem UNIQUE por nome: hoje categorias homônimas são possíveis. Nome não vazio;
cor é metadado textual preservado, sem impor apenas a paleta atual.

### 5.5 credit_cards

E, `name text`, `brand text?`, `color text?`, T. Nome não vazio.
Nenhum saldo, limite, fechamento bancário ou vencimento no cadastro.
Todos os cartões existentes aparecem na projeção de cada mês, inclusive sem
compras: `created_at` não é um filtro de vigência no domínio atual.

### 5.6 simple_accounts

E, `name text`, `amount D`, `month M`, `category_id text?`, `status S`,
`notes text?`, T. Nome não vazio; status padrão pendente.
FK(household_id, category_id) → categories. `value` torna-se `amount`.
Não adicionar `paid_amount`: o valor pago de uma simples paga é o próprio amount.
Corrigir ao pagar substitui esse valor; não existe valor original separado hoje.

### 5.7 recurring_definitions

E, `name text`, `category_id text?`, `start_month M`,
`is_active boolean DEFAULT true`, `notes text?`, T.
FK composta para categories. Nome não vazio. Não existe valor padrão mensal.
Alterações de nome/categoria/atividade afetam projeções abertas; snapshots de
meses fechados têm precedência. Inativar hoje não possui mês final de vigência.

### 5.8 recurring_monthly_records

E, `definition_id text`, `month M`, `amount D DEFAULT 0`,
`is_value_set boolean DEFAULT false`, `status S DEFAULT 'pendente'`,
`notes text?`, T. FK composta para recurring_definitions.
UNIQUE(household_id, definition_id, month).
CHECK(is_value_set OR (amount = 0 AND status = 'pendente')).
Serviço valida mês >= start_month. Um zero explicitamente informado/pago pode
ter is_value_set=true; zero não é sinônimo de ausência de informação.
`notes` do registro é preservado embora a projeção atual use as notas da definição.

### 5.9 installment_purchases

E, `description text`, `total_amount D`, `installments_count integer`,
`start_month M`, `effective_from_month M?`, `base_installment_number integer?`,
`credit_card_id text?`, `category_id text?`, `notes text?`, T.
FKs compostas para credit_cards/categories. Description não vazia.
CHECK installments_count >= 1; base, quando presente, entre 1 e installments_count.
Sem teto de 60/120: os testes incluem 130 parcelas. NULL em effective/base mantém
fallback do domínio para start_month/1. Não impor effective >= start: a edição
retroativa precisa de decisão específica antes de impor tal restrição.
Mês final, parcela corrente e valor mensal normal não são colunas desta tabela.

### 5.10 installment_month_states

H, `purchase_id text`, `month M`, `status S?`, `amount_override D?`, T.
PK(household_id, purchase_id, month), FK composta para installment_purchases.
CHECK(status IS NOT NULL OR amount_override IS NOT NULL).
Os dois maps opcionais atuais são unidos pela união de suas chaves, preservando
ausência individual; status NULL resolve para pendente. O override é o valor da
ocorrência, não necessariamente dinheiro pago: persiste após reversão.
Maps existentes em compras de cartão são preservados, mas ignorados na fatura.
Novos pagamentos avulsos só podem ocorrer se a ocorrência estiver ativa e avulsa.

### 5.11 installment_month_snapshots

H, `purchase_id text`, `month M`, `current_installment integer`,
`total_installments integer`, `remaining_installments integer`,
`installment_amount D`, `end_month M`, `description text?`,
`category_id_snapshot text?`, `total_amount D?`,
`card_id_snapshot text?`, `card_assignment_known boolean DEFAULT false`,
`schema_version integer`, `captured_at timestamptz?`, `recorded_at timestamptz`.
PK(household_id, purchase_id, month), FK composta para installment_purchases.
CHECK total_installments >= 1, current entre 1 e total, remaining = total-current,
end_month >= month, schema_version >= 1 e
(card_assignment_known OR card_id_snapshot IS NULL).

Essa duplicação é intencional: são fatos congelados. category/card históricos
não são FKs para cadastros vivos. `card_assignment_known=true` + NULL identifica
avulso conhecido; false identifica associação histórica não registrada no legado.
Snapshot legado usa schema_version=1; versão futura completa usa 2, com nome,
total e associação resolvidos no momento da captura. Não inventar informação
ausente na importação. Categoria NULL no legado mantém o fallback atual; sua
ambiguidade é documentada na seção 17. O legado não registra instante da captura:
captured_at fica NULL e recorded_at registra a importação. Novas capturas exigem
captured_at preenchido, sem atribuir esse instante a snapshots antigos.

### 5.12 card_expenses

E, `card_id text`, `description text`, `amount D`, `month M`,
`category_id text?`, T. FKs compostas para credit_cards e categories.
Description não vazia. Não tem status/pagamento próprio: integra a fatura.

### 5.13 card_monthly_invoices

E, `card_id text`, `month M`, `recorded_status S`, `paid_amount D?`,
`manual_adjustment numeric(15,2)?`, `paid_at timestamptz?`, T.
FK composta para credit_cards; UNIQUE(household_id, card_id, month).
`status` atual mapeia para recorded_status para distingui-lo do estado exibido,
que depende do saldo recalculado. Status padrão pendente; paid_amount NÃO recebe
default zero: NULL é a semântica legada, diferente de pagamento explícito zero.
manual_adjustment admite sinal, finito, e é preservado sem entrar no cálculo.

Não impor CHECK ligando status e total calculado: o total depende de outras
linhas, e uma compra nova pode mudar o estado exibido sem alterar o registro.
Serviço controla pagamento <= total no momento do comando, total acumulado
substitutivo, reversão e paid_at. Timestamps legados não são prova de quitação.

### 5.14 financial_months

H, `month M`, `current_closure_id uuid?`, T.
PK(household_id, month). Linha criada sob demanda em mutação/fechamento, não por
mera navegação; ausência ou ponteiro NULL representa mês aberto.
FK(household_id, month, current_closure_id) →
month_closures(household_id, month, id), RESTRICT, com coluna opcional usando
MATCH SIMPLE. Não criar flag closed redundante.

### 5.15 month_closures

H, `id uuid`, `month M`, `revision integer`, `closed_at timestamptz`,
`schema_version integer`, `rules_version text`, `payload jsonb`,
`recorded_at timestamptz`, `source_import_id uuid?`.
PK(household_id, month, id); UNIQUE(household_id, month, revision).
FK(household_id, month) → financial_months; FK(household_id, source_import_id)
→ import_batches(household_id, id). CHECK revision/schema_version >= 1,
rules_version não vazio e jsonb_typeof(payload) = 'object'.
Revisão cresce sob lock, nunca reutilizada. Payload contém o ClosedMonthSnapshot
integral (`month`, `closedAt`, `accounts`, `summary`), validado pelo serviço
conforme schema_version, incluindo correspondência com month/closed_at externos.
Snapshots legados não recebem validações financeiras novas retroativamente.

A FK circular com financial_months é montável em duas fases: mês com ponteiro
NULL, fechamento e depois ponteiro, tudo na mesma transação. O DDL futuro deverá
declarar a FK do ponteiro após criar as duas tabelas. Não exige uma linha de
fechamento fictícia nem FKs desligadas durante uso normal.

### 5.16 month_reopenings

H, `month M`, `closure_id uuid`, `reopened_at timestamptz?`,
`recorded_at timestamptz`, `source text`.
PK(household_id, month, closure_id), FK composta para month_closures.
CHECK source IN ('command','legacy_import'); source=command exige reopened_at.
O localStorage não registra instante da reabertura: importação usa NULL e
source=legacy_import, sem confundir closedAt com reopenedAt. Evento append-only.

### 5.17 import_batches

H, `id uuid`, `source_key text`, `source_sha256 text`, `source_payload jsonb`,
`imported_at timestamptz`, `importer_version text`.
PK(household_id, id); UNIQUE(household_id, source_sha256).
CHECK hash com 64 caracteres hexadecimais, payload objeto, textos não vazios.
Uma linha só representa importação concluída na mesma transação dos dados.
Backup bruto externo preserva os bytes; JSONB preserva o conteúdo, não sua
formatação. Não guardar falha como sucesso nem inserir parcialmente o lote.
Política de retenção desse backup financeiro será definida antes da implantação.

## 6. PKs, FKs, constraints e índices

Todas as FKs entre entidades financeiras incluem household_id, impedindo que uma
conta de A referencie um cartão de B. IDs textuais não vazios; nomes/descrições
obrigatórios não vazios após trim. Relações opcionais usam NULL, não string vazia.
Não criar unicidade para nomes, cores ou valores monetários.

PKs e UNIQUE já cobrem consultas por identidade, registro mensal por definição,
estado/snapshot por compra e fatura por cartão/mês. Índices adicionais propostos:

| Tabela | Índice B-tree | Motivo |
| --- | --- | --- |
| simple_accounts | (household_id, month) | Grade e consultas anuais por intervalo |
| recurring_monthly_records | (household_id, month) | Carregar todos os registros do mês |
| card_expenses | (household_id, card_id, month) | Compor fatura e histórico do cartão |
| card_monthly_invoices | (household_id, month) | Carregar pagamentos do mês |
| installment_purchases | (household_id, credit_card_id) | Parcelamentos de cada cartão |
| household_memberships | (user_id, household_id) | Núcleos acessíveis ao usuário |

Categorias/definições/parcelamentos inicialmente são pequenos e carregados por
household; índices por status, cor, booleano, JSONB/GIN ou cada FK opcional não
têm justificativa inicial. Avaliar EXPLAIN e volume na futura implementação.
As PKs de fechamentos e meses cobrem histórico anual por faixa de month; UNIQUE
das revisões cobre ordenação de versões. Não duplicar índices automáticos de PK.

CHECKs são locais à linha; não resolvem soma de compras, autorização, mês fechado
ou imutabilidade. Essa fronteira segue os mecanismos de integridade do
[PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html).

## 7. Exclusões e integridade transacional

Proposta conservadora: todas as FKs com ON DELETE RESTRICT e ON UPDATE RESTRICT;
nenhum cascade genérico. IDs/household são imutáveis. Comandos futuros removem
ou desvinculam dependências explicitamente e validam meses afetados antes disso.

- Categoria: zerar FKs opcionais vivas e excluir cadastro na mesma transação.
  Exceção já existente permite retirar categoria de linha mensal fechada;
  payloads e IDs históricos permanecem intactos.
- Simples/despesa: só excluir se o mês da ocorrência estiver aberto.
- Fixa: o código remove definição e todos os registros. Havendo registro em mês
  fechado, assertFinancialMutation bloqueia a operação inteira. Reproduzir essa
  checagem; se permitida, remover registros antes da definição.
- Cartão: o código remove despesas/faturas e desvincula parcelamentos (viram
  avulsos). Registros mensais fechados envolvidos bloqueiam a operação. No banco,
  validar antes e desvincular/remover dependentes explicitamente, nunca propagar
  exclusão para snapshots de fechamento.
- Parcelamento: exclusão atual remove a compra inteira, inclusive maps e snapshots
  internos, mas não fechamentos oficiais. Proposta para preservar também o histórico
  de parcelas: RESTRICT quando houver snapshots; exclusão lógica/versão de
  cancelamento exige decisão prévia (seção 18), não alteração silenciosa da regra.
- Household, importações e fechamentos: nenhuma exclusão ordinária; eventual
  expurgo será operação administrativa separada, fora deste projeto.

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

## 13. Snapshots e imutabilidade

Fechamento guarda uma cópia integral e autossuficiente: nomes/categorias/cores,
valores, status, notas, metadados de parcelas, itens internos, pagamentos, saldos,
contadores e resumo. Nenhum join com cadastros atuais para reconstruir a tela
histórica. IDs embutidos servem à rastreabilidade e não exigem cadastro ainda vivo.

Payload legado schema_version=1 mantém chaves e ausências originais, em especial
paidAmount. rules_version identifica o algoritmo da captura; quando desconhecido,
usar marcador 'legacy-unknown', sem atribuir certeza indevida. Para novas capturas,
versão 2 usa representação decimal canônica para campos monetários; adaptador
explícito devolve as interfaces atuais. Campos não monetários continuam números.
Backup do lote preserva dados originais durante qualquer transformação.

Imutabilidade futura precisa ser executável: papel da aplicação sem UPDATE/DELETE
em month_closures, month_reopenings e installment_month_snapshots; trigger de
rejeição como defesa adicional. Novas capturas são INSERT controlado pelo serviço.
Não basta documentar append-only nem confiar no React. Nenhum desses privilégios
ou triggers foi instalado nesta etapa. Administrador continua tecnicamente capaz
de alterar o banco; permissões operacionais devem separá-lo da aplicação.

## 14. Fechamento, reabertura e concorrência

Proposta inicial de serialização: cada comando obtém lock da linha households
antes de ler os dados financeiros, valida revision esperada, lê um estado coerente,
aplica domínio, persiste e incrementa revision. Todas as rotas de escrita devem
obedecer ao mesmo protocolo, inclusive categorias/importação. Esse lock mais amplo
é deliberadamente simples e cobre dependências entre meses/cartões; poderá ser
refinado somente com testes de concorrência. Reads multiconsulta precisam de
snapshot transacional consistente. Impedir DML direto que contorne o serviço.

Fechar, na mesma transação:

1. Obter lock, conferir revisão e que mês não tem current_closure_id.
2. Calcular contas e resumo no estado bloqueado. Todas as contas devem estar
   pagas, e todas as fixas devem ter isValueSet=true. Parcial bloqueia. Mês sem
   contas é elegível (`every` vazio); não adicionar restrição de data/calendário.
3. Criar financial_months se necessário, inserir month_closures com próxima
   revision, payload validado e instante de fechamento; apontar current_closure_id.
4. Confirmar transação inteira. Qualquer falha desfaz tudo.

Reabrir: bloquear, exigir ponteiro vigente, inserir month_reopenings para esse
fechamento e limpar somente o ponteiro. Não alterar contas, pagamentos, snapshot
ou outros meses. Novo fechamento insere nova revisão e torna-se vigente.
Um evento de reabertura não pode coexistir com ponteiro ativo para a mesma
revisão; garantir no comando transacional e em trigger futuro. Proibir remoção ou
troca do ponteiro fora desses comandos. Duplicatas de fechamento/reabertura
retornam erro de estado, como no domínio atual.

Pagamentos/edições/exclusões mensais fechadas são rejeitados. Exceção para retirada
de categoria não autoriza alterar demais campos. Alterações globais de definição,
cartão ou compra não podem reescrever payloads. `assertFinancialMutation` hoje
verifica diretamente só quatro coleções mensais e os snapshots oficiais; não
confundir essa proteção com versionamento completo das definições.

Reabrir agosto não reabre setembro automaticamente. Meses fechados posteriores
continuam usando seus snapshots autoritativos, mesmo quando a revisão anterior
muda; meses abertos são recalculados pela cadeia. Uma política de reconciliação
de dependências entre fechamentos é decisão de produto, não migração automática.

## 15. Household e usuários futuros

Dados pertencem ao household; usuários acessam via memberships. Um usuário pode
participar de vários núcleos, vários usuários podem compartilhar um núcleo.
O backend futuro deve resolver o household autorizado pela identidade autenticada,
nunca confiar somente no ID recebido do navegador. FKs compostas asseguram
integridade, mas não autorização de leitura/escrita. Políticas RLS ou camada de
autorização equivalente serão requisito antes de disponibilizar endpoints.

Nenhum login, provedor ou autenticação foi implementado. Não expor temporariamente
um endpoint público com household fixo. A criação inicial do núcleo e a associação
do primeiro owner ocorrerão no processo autorizado de integração/importação.

## 16. Estratégia futura de migração do localStorage

Plano apenas; nada foi exportado de navegador, importado ou enviado ao banco.

1. Exportar JSON bruto de cada origem/navegador com confirmação do núcleo de
   destino; guardar backup e SHA-256. Defaults repetem IDs em máquinas distintas,
   portanto não unir automaticamente origens no mesmo household.
2. Validar shape completo, arrays, IDs e relações, meses, dinheiro, status, datas,
   cardinalidades e chaves de maps. Encontrar duplicatas que hoje `.find()` pode
   esconder. Gerar relatório de órfãos e inconsistências; bloquear o lote até
   revisão, sem descartar itens nem substituir por demonstração.
3. Tratar timestamps vazios/inválidos (inclusive closedAt) explicitamente: guardar
   original no backup, exigir decisão de reparo ou modelo de data desconhecida.
   Não atribuir a hora atual como se fosse a hora histórica. Preservar opcionais.
4. Executar simulação local futura: construir modelo e reconstruir FinanceDataStore,
   comparando projeções em todos os meses relevantes, vigências até o término,
   saldos até após a última quitação, anuais e fechamento/reabertura. Comparar
   snapshots estruturalmente e valores em centavos, incluindo campos ausentes.
5. Importar em transação futura autorizada: household, lote, cadastros, ocorrências,
   maps e snapshots; criar meses e revisões antigas na ordem do array de histórico,
   eventos legacy_import, depois revisão vigente e ponteiro. closedAt não é chave:
   duas revisões podem ter mesmo timestamp. Não reconstruir snapshot do passado
   a partir dos cadastros atuais. Arquivos legados incompletos não são inventados.
6. UNIQUE(household, hash) torna reenvio do mesmo lote idempotente. Se household
   já tem dados, rejeitar mistura até existir política de merge. Hash diferente
   não autoriza duplicar o mesmo universo financeiro. Nenhum seed automático.
7. Comparar totais, contagens e conteúdo após leitura. Só então escolher o novo
   armazenamento, mantendo backup local e caminho de retorno. Não manter duas
   fontes graváveis simultaneamente. Rollback de importação falha é transacional;
   rollback após uso real exige exportar novas alterações antes de voltar ao local.

## 17. Riscos encontrados

| Evidência atual | Risco e tratamento proposto |
| --- | --- |
| Validação de carga só inspeciona categories | Dados inválidos/órfãos podem existir; importar com relatório, sem apagar |
| paidAmount opcional e snapshots legados | NULL não equivale a zero; preservar caminho legado e snapshots originais |
| manualAdjustment declarado mas não calculado | Não ativar ajuste inadvertidamente |
| Snapshots de parcelas sem cartão e com campos opcionais | Não é possível recuperar sempre associação/nome/categoria históricos; preservar desconhecido |
| Fallback de categoryId/description para cadastro vivo | Snapshot parcial não é totalmente autossuficiente; versão completa precisa de semântica de ausência explícita |
| applyInstallmentUpdate captura no máximo 120 meses | Histórico anterior pode faltar em contratos longos; revisar antes de integrar |
| Edição retroativa com snapshot já existente | Snapshot tem prioridade sobre nova configuração; conflitos precisam de política explícita |
| Exclusão inteira de compra/fixa/cartão | Pode alterar meses abertos anteriores; definir cancelamento prospectivo separadamente |
| Pagamento acima do total após redução/edição posterior | Hoje saldo é truncado a zero sem crédito; não inventar estorno ou crédito |
| Definições globais e cartão vigente mutáveis | Histórico aberto pode mudar; fechado depende do snapshot, não das FKs vivas |
| Reabertura anterior a outro mês fechado | Fechamento posterior conserva fotografia antiga; não reconciliar silenciosamente |
| Arredondamento JS e parcela uniforme | Diferenças de centavos ao usar decimal; exigir testes de paridade antes da troca |
| Filtros visuais/ordem dos arrays | SQL não tem ordem implícita; adaptador deve definir ordem estável antes da integração |
| Sem concorrência/identidade no cliente atual | Lock/revision, autorização e importação por núcleo são requisitos futuros |

## 18. Decisões antes da implementação e validação desta etapa

O modelo acima é a recomendação de partida. Antes de transformar o projeto em
migration aplicável, decidir e registrar:

1. Política de exclusão de parcelamentos com snapshots: restrição proposta versus
   cancelamento prospectivo/versionamento; impactos nos meses abertos anteriores.
2. Política de alterações retroativas, troca de cartão e lacunas além de 120 meses;
   aprovar separadamente ajustes de domínio, sem incorporá-los à troca de storage.
3. Manter exatamente as inferências legadas ou normalizar faturas abertas em
   processo explícito auditado. Recomendação inicial: preservar NULL e fallback.
4. Limites monetários, arredondamento decimal e tratamento de inconsistências
   importadas; nenhuma redistribuição automática de centavos.
5. Reconciliação após reabrir mês anterior, excesso de pagamento decorrente de
   edição e eventual efeito de manualAdjustment. Recomendação inicial: paridade.
6. Ordenação estável: se a ordem original das listas precisar ser idêntica,
   acrescentar posição de origem persistida no modelo antes da integração.
7. Provedor de identidade, papéis efetivos, RLS, primeiro owner, retenção de backups,
   papel de migration e papel restrito da aplicação; sem acesso financeiro público.
8. Versão PostgreSQL do destino, futura migration DDL, triggers de imutabilidade,
   validação dos payloads e testes reais de isolamento em ambiente autorizado.

O arquivo SQL de proposta era opcional nesta tarefa e não foi criado: o dicionário,
as constraints e os protocolos acima constituem o projeto para revisão. Nenhum
DDL está conectado a scripts, build, deploy ou runner de migrations. A futura
migration deverá começar com `-- DRAFT ONLY` e
`-- DO NOT EXECUTE WITHOUT REVIEW` enquanto for apenas proposta.

Validação em 23/09/2026:

- `npm test`: 36 testes passaram, zero falhas.
- `npm run lint`: passou; executa TypeScript frontend/configuração e backend
  (`tsc --noEmit && tsc -p tsconfig.server.json`), sem ESLint separado no projeto.
- `npm run build`: passou, 1.701 módulos. Primeira tentativa bloqueada por leitura
  de diretório pelo sandbox; nova execução autorizada concluiu sem alterar código.
- Scripts complementares de navegador não foram executados nesta mudança
  exclusivamente documental; não fazem parte de `npm test`.
- Revisão do diff: somente este documento novo; regras, interfaces TypeScript,
  componentes, persistência, dependências e configurações não foram alterados.

Nenhum banco foi acessado ou alterado. Nenhum SQL, migration ou seed foi executado.
Nenhuma estrutura de `public`, inclusive `public.Contas` e
`public.Controle_Contas`, foi tocada. A etapa termina no projeto para revisão.
