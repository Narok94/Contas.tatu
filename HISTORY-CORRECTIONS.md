# Correções locais de pagamento e fechamento

As duas correções foram aplicadas sobre a implementação local existente, preservando o restante do trabalho e os layouts aprovados.

## Pagamento

**Causa:** `toggleAccountStatus` encaminhava toda conta pendente para `requestPayment`, tornando obrigatória a conferência de valor.

**Correção:** a ação principal agora chama diretamente `recordPayment`, sem fornecer valor alternativo; o domínio resolve o valor atualmente registrado e paga imediatamente. A reversão explícita continua disponível em mês aberto. O comando permanece idempotente e os controles de Contas ignoram o segundo evento de um duplo clique, evitando reversão acidental logo após pagar.

**Edição opcional:** em Início e Contas, o pequeno menu `…` ao lado de pagar oferece `Alterar valor ao pagar`. Só essa opção abre o diálogo. O componente é compartilhado, não aumenta a altura dos cards e utiliza o mesmo comando financeiro do pagamento imediato. Cancelar não grava nada; confirmar grava valor e estado juntos, sem lançamento de ajuste separado.

| Tipo | Pagamento normal | Alteração opcional |
| --- | --- | --- |
| Simples | Imediato pelo valor registrado | Substitui o valor do lançamento e paga |
| Fixa | Imediato pelo valor registrado no mês | Afeta somente o registro mensal selecionado |
| Parcela avulsa | Imediato pelo valor da ocorrência | Preserva as demais parcelas e o total da compra; não redistribui diferença |
| Cartão | Imediato pelo total calculado pelas compras | Não oferece alteração arbitrária; correções continuam sendo feitas nos itens da fatura |

O pagamento de faturas anteriores também é imediato e usa o mês de origem, mesmo quando a tela está consultando um mês já fechado.

## Fechamento e saldo anterior

**Causa:** `closeMonth` e Histórico condicionavam a elegibilidade a `pending || pastInvoices`, misturando obrigações do mês com faturas de meses anteriores.

**Correção:** somente pendências próprias do mês, incluindo registros de fixa ainda não resolvidos, impedem o fechamento. Faturas anteriores continuam registradas e não são quitadas, excluídas, transferidas ou copiadas como despesas do mês fechado.

O snapshot mantém `totalExpected`, `totalPaid`, `totalPending`, contas e categorias referentes ao mês. O saldo anterior permanece apenas em campos complementares separados, como `previousPendingCardsTotal` e `previousPendingInvoices`, preservando o contexto da data de fechamento. Não é somado aos gastos ou pagamentos do mês.

Para evitar apresentar uma dívida já quitada como ainda pendente em Contas, `computeOperationalMonthlyAccounts` atualiza somente o saldo anterior operacional a partir das faturas de origem. Início e Contas refletem essa resolução posterior; Histórico fechado continua lendo o snapshot original. Essa distinção não modifica valores, pagamentos ou contas do mês fechado.

Textos do Histórico agora separam os fatos:

- “Todas as contas de Setembro 2026 estão resolvidas. Você já pode fechar o mês.”
- “Existem R$ 5.110,00 em 7 faturas de meses anteriores. Esse saldo é separado das contas deste mês e não impede seu fechamento.”
- Após fechar, a informação anterior é apresentada como existente **no momento do fechamento**, sem sugerir que foi quitada por ele.

Fechamento duplicado, pagamentos, reversões e edições do próprio mês fechado continuam bloqueados.

## Validação

`npm test`: **13 testes aprovados**. Foram atualizados o teste de saldo anterior e a idempotência do pagamento normal; foi adicionado o cenário exato de Setembro. A suíte preserva a cobertura de pagamento corrigido, fixa mensal, parcela sem redistribuição, proteção de cartão, snapshots, reversão, legado e reload.

`tests/browser-validation.cjs`: validação em Edge com perfil isolado e data fixa de Setembro/2026. Foram exercitados:

- Pagamento imediato sem modal em Início e Contas, incluindo duplo clique.
- Edição opcional, cancelamento sem alteração da persistência, valor inválido e dupla confirmação.
- Alteração mensal de fixa e parcela; cartão sem opção de valor arbitrário.
- Setembro com **8 contas, 8 pagas, 0 pendentes, R$ 4.844,90 pago, R$ 0,00 pendente e R$ 5.110,00 anteriores**.
- Botão de fechamento disponível nesse cenário; snapshot com R$ 4.844,90, sem absorver os R$ 5.110,00.
- Sete faturas anteriores preservadas após fechar e recarregar; pagamento posterior de uma delas no mês de origem, reduzindo a lista operacional para seis e mantendo o snapshot intacto.
- Bloqueio de edição, exclusão, criação e reversão do mês fechado.
- Mesmas posições do shell nas três telas em 1280×720, 1366×768, 1440×900 e 1920×1080; Início sem scroll vertical.

TypeScript (`npm run lint`) e build (`npm run build`): aprovados. Diff revisado; sem erros em `git diff --check`.

Capturas e medidas estão em `C:/Users/Henrique.costa/.codex/visualizations/2026/09/18/01a0b1df-9fd6-7e33-acdf-f488909f58cd/history-corrections`. Foram inspecionados os estados de elegibilidade/fechamento do cenário solicitado e a apresentação das ações em Início e Contas.

## Arquivos alterados nesta revisão

- `src/components/AccountCard.tsx`
- `src/components/CreditCardAccountCard.tsx`
- `src/components/PaymentOptions.tsx` (novo)
- `src/context/FinanceContext.tsx`
- `src/domain/financeRules.ts`
- `src/domain/monthOperations.ts`
- `src/pages/DashboardPage.tsx`
- `src/pages/HistoryPage.tsx`
- `src/history.css`
- `tests/monthOperations.test.ts`
- `tests/browser-validation.cjs`
- `HISTORY-REVIEW.md` (aviso sobre as regras substituídas)
- `HISTORY-CORRECTIONS.md` (este relatório)

Nenhuma alteração em Neon, backend, API, shell, header, sidebar ou cards de categoria/tipo nesta revisão. Nenhum commit, push, merge, deploy, force push ou alteração de remote. Tudo permanece local para revisão.
