# Contas.tatu

## Arquitetura

O frontend React/TypeScript usa Vite e continua utilizando exclusivamente o
armazenamento local existente. Nenhum fluxo financeiro chama a API nesta etapa.

Arquitetura preparada: **React/Vite → Vercel Function → Neon (futuro)**.
Na Vercel, `dist/` contém o frontend e `api/health.ts` é executado sob demanda
no runtime Node.js em `/api/health`. Não há processo Express nem `listen()`.
O health check é público: GET retorna `200 {"status":"ok"}`, HEAD retorna 200
sem corpo e outros métodos retornam 405. Não lê secrets, não consulta banco e
não informa versões, configuração ou detalhes internos. Não verifica o Neon.

## Backend e secrets

- `api/`: pontos de entrada HTTP para `/api/health` e `/api/db-health`.
  O diagnóstico do banco aceita GET/HEAD e consulta somente metadados em uma
  transação read-only. Confirma `neondb`, `finance_v2` e 18 tabelas; falhas
  retornam HTTP 500 com mensagem genérica, sem detalhes de conexão.
- `server/neon.ts`: fonte única do cliente HTTP Neon server-side. `getNeonClient()`
  valida a configuração e cria/reutiliza o cliente por instância do runtime.
  Importar o módulo não lê secrets; criar o cliente não executa consultas.
  `/api/db-health` utiliza esse cliente; `/api/health` permanece independente.
- `tsconfig.server.json`: valida o backend separadamente, com tipos Node.js.
- O Vite rejeita imports de `api/` e `server/` e bloqueia o acesso direto a essas
  pastas pelo servidor de desenvolvimento. O frontend não importa esses módulos.
- Configure exclusivamente `CONTAS_TATU_DATABASE_URL` no ambiente server-side
  das Vercel Functions. Não há fallback para variáveis de outras integrações.
  Localmente, o processo Node deve carregar `.env.local` (por exemplo, com
  `node --env-file=.env.local` ao executar um script server-side). O módulo
  lê `process.env` sob demanda e não abre arquivos de ambiente.
- Nunca use prefixo `VITE_` para secrets: esse prefixo disponibiliza valores ao
  navegador. Não adicione secrets ao `define` do Vite, respostas HTTP ou logs.
  O cliente fica restrito ao servidor; não retorne erros brutos do driver em APIs.
- Arquivos `.env*` (exceto o exemplo) e `.vercel/` são ignorados pelo Git.
  Lint, build, testes e `/api/health` não precisam de credenciais do banco.
  `/api/db-health` exige a variável configurada no ambiente server-side.

## Desenvolvimento e validação

Após instalar as dependências com `npm install`:

```sh
npm run dev    # frontend Vite existente, porta 3000
npm run build
npm run lint   # TypeScript do frontend/configuração e backend
```

Para testar o runtime server-side, com a CLI Vercel instalada e configurada:
execute `npm run dev:api` (equivale a `vercel dev`) e use a URL/porta exibida:

```sh
curl -i http://localhost:3000/api/health
curl -I http://localhost:3000/api/health
curl -i -X POST http://localhost:3000/api/health
```

Não execute o Vite separadamente na mesma porta. `npm run dev` e `vite preview`
sozinhos não executam Vercel Functions. A CLI pode solicitar vinculação a um
projeto Vercel; não é necessário configurar banco. Não baixe secrets de produção
para testar o health check.

O driver Neon e a migration inicial de `finance_v2` estão disponíveis. Antes de
criar endpoints de dados, definir autenticação/autorização, privilégios do banco
e tratamento seguro de erros. O frontend e o localStorage permanecem independentes
do banco; esta camada não cria CRUD nem executa migrations automaticamente.

Referência: https://vercel.com/docs/functions/runtimes/node-js
