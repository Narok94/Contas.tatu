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

- `api/`: pontos de entrada HTTP; somente o health check está implementado.
- `server/neon.ts`: local reservado para o futuro cliente Neon. Exporta apenas
  uma leitura de configuração sob demanda; importar o módulo não lê secrets,
  inicializa clientes ou abre conexões. Nenhum código chama essa função hoje.
- `tsconfig.server.json`: valida o backend separadamente, com tipos Node.js.
- O Vite rejeita imports de `api/` e `server/` e bloqueia o acesso direto a essas
  pastas pelo servidor de desenvolvimento. O frontend não importa esses módulos.
- No futuro, configure `NEON_READONLY_DATABASE_URL` ou `DATABASE_URL` no ambiente
  server-side da Vercel. A primeira tem precedência; o nome não garante permissões:
  o usuário do banco deverá ter privilégios efetivamente restritos.
- Nunca use prefixo `VITE_` para secrets: esse prefixo disponibiliza valores ao
  navegador. Não adicione secrets ao `define` do Vite, respostas HTTP ou logs.
  Somente o módulo server-side usa `node:process` para ler essas duas variáveis.
- Arquivos `.env*` (exceto o exemplo) e `.vercel/` são ignorados pelo Git.
  Nenhuma credencial precisa ser configurada para esta etapa.

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

Antes de integrar o Neon: definir autenticação/autorização para endpoints de
dados, privilégios do banco, driver, tratamento seguro de erros e política de
conexões. Não existem driver Neon, SQL, schema, tabelas ou migrations nesta etapa.

Referência: https://vercel.com/docs/functions/runtimes/node-js
