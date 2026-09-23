# Contas — grade, detalhes e filtros

## Resultado

| Resolução | Colunas | Largura aproximada do card |
| --- | --- | --- |
| 1280×720 | 3 | 322 px |
| 1366×768 | 3 | 350 px |
| 1440×900 | 4 | 278 px |
| 1920×1080 | 4 | 394 px |

A grade observa a largura útil do próprio painel: quatro colunas a partir de 1130 px. Sidebar e shell não foram alterados. Padding horizontal do corpo reduzido a 10 px, rodapé a 8 px, gap da grade a 10 px e ícones secundários a 22 px. Tags e ações têm espaçamento menor. Nomes usam ellipsis com texto integral no DOM e atributo title; categorias também possuem title. Não foi acrescentada altura aos cards comuns.

O cartão fechado mostra tipo, status, nome, total, Ver detalhes e ações. Pago/Restante aparece somente no estado parcial. O cartão pendente da amostra tem 177,5 px de altura, comparado a 161–180 px das contas fixas/parceladas. Pago e pendente não apresentam saldo zero ou detalhamento redundante.

Ver detalhes apresenta total, compras do mês, um saldo anterior consolidado com mês quando existente, pago, restante e compras com suas ações. Recolher restaura a altura compacta; o teste compara o armazenamento antes/depois e confirma ausência de mutação.

## Filtros e ordenação

Categorias vêm diretamente de categories do FinanceContext (cadastro real), sem lista fixa. O seletor filtra categoryId da conta; compras internas não transformam uma fatura sem categoria em conta de uma categoria específica.

Status, Tipo e Categoria combinam por interseção. Parciais usa o status real parcial. Pendentes mantém a semântica anterior de contas ainda não integralmente pagas, incluindo parciais.

Organizar por permanece dentro do painel:
- Padrão: conserva exatamente a ordenação anterior, com não pagas antes das pagas e estabilidade dentro dos grupos.
- Maior/Menor valor: ordena amount, o mesmo total exibido; nunca soma novamente compras internas.
- Categoria: comparação pt-BR pelo nome, com ordem estável nos empates; contas sem categoria ficam primeiro.
- Nome A–Z: comparação pt-BR pelo nome da conta.

Recolher mantém filtros e ordenação. O botão mostra quantidade de filtros e um indicador discreto de ordenação personalizada. Limpar filtros restaura Todas, Todos os tipos, Todas as categorias e Padrão. A contagem principal continua única e acompanha os resultados, inclusive 0 contas e 1 conta.

## Integridade financeira e validação

Nenhum arquivo de domínio financeiro, contexto, armazenamento, API, backend ou histórico foi alterado. Resumos e outras telas foram preservados.

- npm run lint: aprovado (TypeScript frontend e servidor).
- npm test: 36/36 aprovados, sem ignorados.
- npm run build: aprovado.
- tests/accounts-browser-validation.cjs: aprovado, ampliado para categorias reais, todas as ordenações, combinações, estabilidade, valor consolidado da fatura, limpeza, indicação, contagem, expansão sem mutação e retorno à altura original.
- tests/browser-validation.cjs: aprovado integralmente, incluindo demais telas, pagamentos, fechamento/reabertura e histórico.
- Quatro resoluções: capturas conferidas; sem overflow horizontal, colisões de ações ou cortes indevidos nos cenários testados. Incluem filtros expandidos, seletores, nomes longos, valores grandes e cartão fechado/expandido.
- git diff --check: aprovado.

A regressão confirmou agosto 1000/900/100, setembro 2000/1500/500 e outubro recebendo somente 500; quitação integral zera transporte. Reload e fechamento/reabertura não recriam dívida. Compras internas não viram pendências e o anual soma somente o efetivamente pago.

Artefatos locais: %TEMP%/contas-tatu-accounts-review (capturas e accounts-validation.json) e %TEMP%/contas-tatu-history-review (suíte geral).

## Arquivos desta tarefa

- src/accounts.css
- src/components/AccountCard.tsx
- src/components/CreditCardAccountCard.tsx
- src/pages/AccountsPage.tsx
- tests/accounts-browser-validation.cjs
- ACCOUNTS-FINAL-REVIEW.md

HISTORY-SIMPLIFICATION-REVIEW.md já existia como arquivo não rastreado e permanece fora da tarefa e do commit.
