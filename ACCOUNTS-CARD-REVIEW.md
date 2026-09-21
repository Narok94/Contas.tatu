# Contas Tatu — cartão, densidade e filtros

Validação em 21/09/2026 sobre a main existente (`3954709`).

## Regra financeira

A implementação anterior armazenava somente o status da fatura. O pagamento
integral quitava as compras do mês; a consulta de pendências percorria cada mês
antigo e adicionava suas compras não pagas à lista. Não havia valor efetivamente
pago para representar parciais. Por isso o cartão podia aparecer pago e continuar
com várias pendências externas ao total da própria fatura.

Agora `CreditCardMonthlyInvoice.paidAmount` registra o total efetivamente pago
naquela fatura mensal. As compras continuam nos mesmos registros. O domínio
calcula, em ordem cronológica, compras + saldo anterior − pagamento, com
arredondamento em centavos. `previousPendingInvoices` mantém sua forma compatível
de array, mas contém zero ou uma entrada: saldo consolidado do mês imediatamente
anterior. Não são criadas contas ou cópias de compras para transportar dívida.

`Marcar como pago` permanece imediato, sem modal, e registra a quitação de todo o
total, incluindo saldo anterior. Depois de um parcial, a ação completa o total
pago; não soma novamente o que já havia sido pago. O menu de pagamento oferece
`Registrar pagamento parcial`. O formulário pede explicitamente o **total já pago
nesta fatura**, incluindo pagamentos anteriores do mesmo mês. Assim, informar
novamente o mesmo valor é idempotente. Valores negativos, não finitos, com mais de
duas casas ou acima da fatura são rejeitados.

O status é derivado do pagamento e do saldo: Pendente sem pagamento, Parcial com
pagamento e saldo restante, Pago quando quitado. Uma compra adicionada após a
quitação volta a deixar a fatura parcial, preservando o dinheiro já pago.

| Mês | Compras | Saldo anterior | Fatura | Pago | Restante |
| --- | ---: | ---: | ---: | ---: | ---: |
| Agosto | R$ 1.000 | R$ 0 | R$ 1.000 | R$ 900 | R$ 100 |
| Setembro | R$ 1.900 | R$ 100 | R$ 2.000 | R$ 1.500 | R$ 500 |
| Outubro, antes de pagar | R$ 0 | R$ 500 | R$ 500 | R$ 0 | R$ 500 |

Outubro exibe somente `Saldo anterior · Setembro`, R$ 500. Os R$ 100 de agosto
não reaparecem como segunda dívida. Consultar agosto depois mantém R$ 900 pagos,
R$ 100 restantes e status Parcial. O anual soma R$ 2.400 antes de pagar outubro;
após quitar os R$ 500, soma R$ 2.900. Itens internos, saldo transportado e snapshots
arquivados não são somados novamente como pagamentos.

O total previsto passa a incluir o saldo incorporado à fatura, e o total pendente
é o restante efetivo. O total em aberto não adiciona o saldo anterior uma segunda
vez. As categorias continuam representando as compras daquele mês.

## Persistência, fechamento e compatibilidade

- Mantida a chave de armazenamento atual, sem migration, reset ou alteração dos
  dados durante leitura. O campo opcional permite carregar registros antigos.
- Registros legados `pago` sem `paidAmount` significam pagamento somente das
  compras daquele mês, conforme a regra antiga. Não se presume que dívidas
  anteriores tenham sido pagas. Elas são consolidadas na fatura seguinte.
- Snapshots oficiais antigos mantêm valores e status originais. Na tela Contas,
  a fatura de um mês fechado antigo continua sendo aquela quitada no fechamento;
  a informação financeira de dívida anterior permanece no resumo histórico.
  Essa dívida entra consolidada no mês seguinte. A consulta não altera o snapshot.
- Pagamentos e saldo consolidado sobrevivem a reload e navegação, sendo
  reconstruídos a partir dos registros existentes.
- A regra de fechamento permanece: é necessário resolver todas as contas do mês;
  uma fatura Parcial bloqueia o fechamento. Reabrir arquiva o snapshot e preserva
  os registros de pagamento. Fechar/reabrir não recria saldos já quitados.
- Removida a antiga ação de pagar várias faturas anteriores separadamente dentro
  do cartão. O saldo incorporado é pago como parte da fatura atual.

## Interface

Preservadas as três colunas, os três resumos, a identidade visual, os valores
principais, as cores, as ações e a expansão de compras. Reduzidos padding, gaps,
ícones de apoio e espaçamentos. Ações mantêm área mínima de 28 × 28 px. Nomes de
contas e compras podem quebrar linha sem truncamento. A altura cresce naturalmente
para nomes muito longos ou detalhes expandidos.

Medidas da mesma massa de demonstração antes/depois dos ajustes visuais, nas quatro
resoluções. A referência anterior é de geometria, capturada antes da compactação:

| Card | Altura anterior | Altura final | Redução |
| --- | ---: | ---: | ---: |
| Simples | 176,25 px | 144,25 px | 18,2% |
| Fixa pendente | 196,75 px | 164,75 px | 16,3% |
| Fixa paga | 198,75 px | 166,75 px | 16,1% |
| Parcelamento | 217,25 px | 183,25 px | 15,7% |
| Cartão fechado, com saldo anterior | 282 px | 236,5 px | 16,1% |

Os filtros começam recolhidos. `Filtrar` alterna o painel compacto, com chevron,
`aria-expanded` e acionamento por teclado. Status e Tipo continuam combináveis;
Parcial aparece entre Pendentes. Recolher não limpa seleções. O botão indica
discretamente quantos filtros estão ativos. `Limpar filtros` restaura Todas e
Todos os tipos. Nenhuma persistência nova foi criada: reload restaura o estado
transitório inicial, como antes.

Removidas as contagens do cabeçalho, de Total previsto, de Total pago e a contagem
em Ainda pendente. A única contagem principal fica imediatamente acima da grade,
à esquerda de Filtrar. Ela acompanha os resultados, incluindo `0 contas`,
`1 conta` e plural. As contagens dos botões internos continuam contextuais.

Dashboard e Histórico receberam apenas ajustes para a consistência financeira:
parciais entram nas contas em aberto; o restante aparece no Dashboard; o Histórico
mensal informa Parcial, pago e restante. Não houve redesenho dessas páginas nem
alteração de sidebar, header global, Configurações, API/backend, categorias ou
parcelamentos avulsos. Neon/SQL não foram usados.

## Validação

- Baseline: os 18 testes existentes passaram antes da implementação.
- `npm test`: **36 testes passaram, zero falhas e zero ignorados**. Inclui os 18
  existentes, com expectativas antigas de cartão atualizadas para a regra aprovada,
  e 18 cenários novos de saldo, integral/parcial, centavos, histórico, anual,
  persistência, fechamento/reabertura, legado, isolamento por cartão e compras.
- `npm run lint`: TypeScript da aplicação e do servidor sem erros.
- `npm run build`: build de produção concluído.
- `tests/browser-validation.cjs`: suíte completa existente aprovada, preservando
  pagamentos comuns, cancelamentos, proteção de fechamentos, reabertura, anual,
  parcelamentos e geometria do shell.
- `tests/accounts-browser-validation.cjs`: aprovada; exercita filtros completos,
  contagens, pagamento parcial pela interface, cenário exato agosto/setembro/outubro,
  integral sem modal, reload, histórico/anual, fechamento/reabertura e legado.
- Ambas usam Playwright/Edge headless com perfis isolados, sem tocar nos dados do
  perfil habitual do usuário.
- Capturas e medições em **1280×720, 1366×768, 1440×900 e 1920×1080**: três colunas,
  sem overflow horizontal, sobreposição de ações ou corte dos nomes/valores
  testados. Conferidos filtros expandidos/recolhidos, cartão Parcial, compras
  expandidas, nomes longos e valores até R$ 123.456.789,99.
- Revisão do diff e `git diff --check` sem erros de whitespace.

As suítes de navegador aceitam o caminho do módulo Playwright e a pasta de saída
como argumentos. Evidências locais desta execução:

- `%TEMP%/contas-tatu-before`: capturas anteriores e `card-metrics.json`.
- `%TEMP%/contas-tatu-after`: capturas e `validation.json` da suíte existente.
- `%TEMP%/contas-tatu-accounts-review`: capturas e `accounts-validation.json`.

## Arquivos da tarefa

- `src/types/finance.ts`
- `src/domain/financeRules.ts`
- `src/domain/monthOperations.ts`
- `src/context/FinanceContext.tsx`
- `src/components/AccountCard.tsx`
- `src/components/CreditCardAccountCard.tsx`
- `src/components/PaymentDialog.tsx`
- `src/components/PaymentOptions.tsx`
- `src/pages/AccountsPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/HistoryPage.tsx`
- `src/accounts.css`
- `tests/monthOperations.test.ts`
- `tests/cardBalances.test.ts`
- `tests/browser-validation.cjs`
- `tests/accounts-browser-validation.cjs`
- `ACCOUNTS-CARD-REVIEW.md`

O arquivo não rastreado `HISTORY-SIMPLIFICATION-REVIEW.md` já existia no início da
tarefa e foi preservado fora deste commit.
