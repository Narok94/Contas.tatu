# Histórico simplificado e reabertura — revisão local

Base: `0f7d7eabf7df82de090e49a1b628c9f9aa6a7d4b`, branch `main`.
Implementação local, sem commit, push, merge ou deploy nesta tarefa.

## Experiência

- Seletor Mensal/Anual restrito à área do Histórico.
- Mensal: mês, estado, total do mês, pago, pendente e lista de consulta com nome, categoria quando aplicável, valor e situação. Compras dos cartões continuam expansíveis.
- Categorias ficam recolhidas numa seção secundária. O bloco por tipo de conta e textos sobre reconstrução/snapshot foram removidos da apresentação principal; os dados do domínio foram preservados.
- Anual: seleção do ano por setas, total e JAN–DEZ numa grade compacta. Clicar num mês abre sua consulta mensal.
- O total anual soma `totalExpected` de cada mês, com acumulação em centavos. Usa o snapshot vigente nos meses fechados e as ocorrências atuais nos abertos. Inclui contas pagas e pendentes, conforme indicado na tela. Parcelas cadastradas entram nos meses correspondentes, inclusive meses futuros do ano; não são extrapoladas novas contas ou valores de fixas sem registro mensal.
- Não soma novamente os itens de cartão nem saldo anterior. Meses sem valores apresentam R$ 0,00 e não recebem automaticamente o estado Fechado.

## Fechamento e reabertura

- Fechar mês não aparece enquanto houver pendências do próprio mês, inclusive fixa sem valor confirmado. A ação aparece automaticamente quando tudo está resolvido.
- O fechamento continua revalidando as pendências no domínio e cria o snapshot oficial. Saldo anterior não bloqueia nem é incorporado ao gasto mensal.
- Reabrir mês ocupa o mesmo local e pede confirmação curta. A operação não muda registros financeiros, valores, pagamentos, categorias ou dívidas; apenas arquiva o snapshot anterior em `closedMonthHistory` e remove esse mês de `closedMonths`.
- Enquanto reaberto, a consulta lê os dados atuais. Um novo fechamento cria o único snapshot vigente; anteriores permanecem arquivados e protegidos contra mutações comuns.
- Adicionar uma conta esquecida pendente oculta Fechar mês. Pagar a última pendência o disponibiliza novamente.
- A gravação ocorre antes de atualizar o estado da interface. Dados antigos sem o novo campo continuam compatíveis. A restauração de demonstração não pode apagar fechamentos arquivados.
- Pagamento rápido, correção opcional de valor, reversão e regras dos quatro tipos foram preservados.

## Validação executada

- `npm test`: 16 testes aprovados, nenhum falhou ou foi ignorado. São os 13 existentes mais 3 cenários novos abrangendo reabertura/refechamento, operações dos quatro tipos e agregação anual.
- `npm run lint`: TypeScript frontend/configuração e servidor aprovados.
- `npm run build`: aprovado, 1.701 módulos. Executado fora do sandbox devido à restrição de leitura do esbuild já conhecida.
- `tests/browser-validation.cjs`: suíte completa aprovada em Edge headless com perfil isolado. A primeira tentativa encontrou o servidor desligado; o Vite foi iniciado e a execução completa passou.
- Interface: ausência de fechamento com pendências; disponibilidade após pagamento; confirmação/cancelamento; snapshot após reload; bloqueios no mês fechado; reabertura preservando registros; criação e edição de conta esquecida; pagamento imediato; novo fechamento e reload; seleção anual, soma dos meses, ano vazio e navegação anual para mensal.
- Regressões existentes: pagamento rápido no Início e Contas, duplo clique, edição opcional, cancelamento, valor inválido, fixas, parcelas, cartão, saldo anterior pagável na origem e independência de mês futuro.
- `git diff --check`: aprovado após remover uma linha em branco extra no teste. Apenas avisos de conversão LF/CRLF do ambiente.

| Viewport | Shell estável entre telas | Dashboard sem scroll vertical | Mensal e Anual sem overflow horizontal |
| --- | --- | --- | --- |
| 1280 × 720 | Sim | Sim | Sim |
| 1366 × 768 | Sim | Sim | Sim |
| 1440 × 900 | Sim | Sim | Sim |
| 1920 × 1080 | Sim | Sim | Sim |

Posições e dimensões de sidebar, header, seletor global e Nova conta foram comparadas automaticamente entre Início, Contas e Histórico. Capturas Mensal/Anual nas quatro resoluções e dos diálogos Fechar/Reabrir foram inspecionadas. A listagem mensal mantém rolagem conforme o conteúdo; no conjunto de demonstração a altura caiu de aproximadamente 1.619–1.641 px para 1.110–1.132 px.

Evidências: `C:/Users/Henrique.costa/.codex/visualizations/2026/09/18/01a0b480-0182-7501-b39f-dc327859b35e/history-simplified/validation.json` e PNGs na mesma pasta.

## Arquivos

- `src/pages/HistoryPage.tsx`: consulta mensal/anual e confirmações.
- `src/history.css`: estilos restritos ao Histórico.
- `src/domain/history.ts`: agregação anual, novo arquivo.
- `src/domain/monthOperations.ts`: elegibilidade, reabertura e proteção de snapshots arquivados.
- `src/domain/financeRules.ts`: campo opcional de arquivo de fechamentos.
- `src/context/FinanceContext.tsx`: persistência e exposição do comando de reabertura.
- `tests/monthOperations.test.ts`: três cenários adicionais.
- `tests/browser-validation.cjs`: adaptação da experiência e novos fluxos.
- `HISTORY-SIMPLIFICATION-REVIEW.md`: este relatório.

## Limites reais e escopo

Persistência continua em localStorage, sem sincronização entre dispositivos ou controle de concorrência entre abas. A consulta de meses abertos depende dos cadastros disponíveis; snapshots arquivados não são uma interface de restauração de dados. O anual mostra despesas registradas, não apenas desembolsos efetivamente pagos; inclui ocorrências futuras já cadastradas. Não foram adicionados médias, gráficos, pesquisa ou extrato por intervalo. Mobile não foi validado nesta etapa.

Nenhuma alteração em Neon, API, backend, autenticação, Início, Contas, sidebar, header compartilhado, seletor global, Nova conta ou shell. Nenhum push, merge, deploy ou reescrita de histórico foi realizado. A implementação permanece local para revisão.
