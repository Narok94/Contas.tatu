# Acesso fechado do Contas Tatu

Somente Henrique e Jéssica. Não há cadastro, recuperação pública ou login social.
Ambos usam o household existente `ad72e2a0-2643-4c2b-9c31-e15d77103101`.
A API obtém identidade por sessão e membership; nunca por campos do cliente.

## Persistência e aplicação

`002_closed_auth.sql` foi aplicada em 30/09/2026 ao banco `neondb` do endpoint
Neon `ep-mute-flower-b7tq5afc`, já usado pelo ambiente controlado do Contas Tatu.
Antes da escrita foram confirmados household, app_users e ausência das estruturas
de autenticação. A primeira tentativa de DDL foi rejeitada pelo transporte HTTP
por múltiplos comandos em uma consulta; o inventário confirmou ausência de
estruturas parciais. O runner foi ajustado para comandos separados na mesma
transação, e a aplicação foi concluída.

Três tabelas novas: auth_credentials, auth_sessions, auth_login_limits. Não houve
alteração de tabelas financeiras, tabelas legadas ou neon_auth. As duas contas
foram provisionadas por comando administrativo com senha recebida em entrada
oculta, sem arquivo de senha. Os hashes bcrypt têm custo 12 e salts distintos.
Reexecutar provisionamento não redefine senhas existentes automaticamente.

## Sessão e limites

Token aleatório de 256 bits; apenas um digest SHA-256 fica no banco. Cookie HttpOnly,
SameSite=Strict, Path=/ e, em Production, Secure com prefixo __Host-. Sem lembrar,
cookie de navegador, limite de oito horas no servidor e chave de navegação de
256 bits, mantida apenas na memória da página. O digest temporário vincula cookie
e chave; a API exige ambos. Fechar/reabrir, restaurar uma aba ou recarregar a página
exige novo login, mesmo se o navegador restaurar o cookie. Nenhuma chave entra
em localStorage/sessionStorage. Sessões temporárias anteriores ao ajuste também
não são restauradas automaticamente.

Lembrar login usa cookie de 30 dias, renovação após um dia e máximo absoluto de
90 dias. Cada login gera outro token. A renovação estende a validade no servidor
sem trocar o token da sessão, para que logout possa revogá-lo mesmo quando outra
aba está recebendo uma resposta atrasada de renovação. Logout exclui a sessão e
expira o cookie; o frontend ignora respostas de sessão anteriores ao logout.
password_version permite invalidar todas as
sessões quando uma futura alteração de senha incrementar a versão.

POST exige Origin exata e rejeita contextos cross-site. Limites de dez tentativas
por 15 minutos, por endereço e login, persistidos no banco entre instâncias
serverless. Chaves são hashes; não se armazenam senhas, IPs ou logins nessa tabela.
As respostas de login não distinguem usuário inexistente de senha incorreta.
Somente o identificador/nome do usuário e household são retornados ao frontend.
O chat usa essa identidade e não oferece seleção de autor. Registros que já têm
actor_user_id (versões e fechamento/reabertura) recebem o autor do servidor.
O chat permanece em memória; não foi criada persistência de mensagens.

Princípios conferidos nas referências primárias da
[OWASP para senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
e [sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Ambiente

Configurado somente no servidor de Production da Vercel, em 30/09/2026:

- CONTAS_TATU_DATABASE_URL: conexão com o banco acima, que já contém finance_v2
  e as credenciais provisionadas. Não usar o outro endpoint da integração Neon:
  o inventário confirmou que ele não contém finance_v2.
- CONTAS_TATU_APP_ORIGIN: origem HTTPS exata da aplicação, sem barra final.
  Configurada como https://contastatu.vercel.app. Domínios Preview precisam de
  configuração própria; não aceitar origens arbitrárias. O valor anterior da
  conexão Production era Secret e não pôde ser inspecionado; foi atualizado
  explicitamente para a conexão do banco verificado, por stdin sem saída sensível.

Não existe secret no frontend, senha em variável VITE_, token em localStorage
ou fallback de autenticação. Sem configuração correta o backend falha fechado.
Produção não admite o antigo acesso local sem sessão. O owner disponível ainda
é credencial administrativa: uma role de runtime restrita e RLS continuam
pendências de endurecimento e não foram inventados nesta implementação.

Desenvolvimento: npm run dev:controlled usa o Neon provisionado. Testes usam
PGlite isolado e senha aleatória transitória. Nenhuma credencial real entra em
fixtures. Validação visual automatizada inclui 393×852, 414×896 e 1440×1000;
teclado foi simulado por redução de viewport, sem alegar teste em Safari físico.

Validação: seis testes de autenticação aprovados, cobrindo os dois logins,
membership, hashes e tokens persistidos, credenciais inválidas, renovação,
expiração, logout, password_version, cookie Production, CSRF e tentativas
repetidas. Navegador focado confirmou login/logout, autores, mesma casa, sessão
persistente, API protegida e ausência de tokens em localStorage. Scanner não
encontrou a senha inicial nos fontes ou bundle. Lint e build aprovados.
Health check atualizado para 21 tabelas (18 financeiras + 3 de autenticação),
com seus testes específicos. Nenhum deploy manual: publicação pelo push normal.

## Ajuste mobile de login e sessão

Login usa a altura e o offset de visualViewport. Enquanto o login mobile está
montado, documento e body não rolam; seus estilos anteriores são restaurados
na saída. Safe areas entram no cálculo. Em áreas menores, o espaçamento se
adapta; com teclado, a decoração é ocultada temporariamente e somente o card
pode rolar quando necessário para alcançar campos/botão. Não se altera a arte.
Tatu reposicionado em relação à borda do card, sem deslocar o card inteiro;
logo deslocado oito pixels para baixo. Desktop mantém a composição original.

Testes de navegador simulam reabertura com cookies restaurados: marcada permanece,
desmarcada retorna ao login. Também conferem logout seguido de reload, proteção
de rotas, os dois usuários, viewport 393×852/414×896 e desktop. Nenhuma alteração
de usuários, household, migrations ou dados financeiros neste ajuste. Teclado
validado por viewport reduzida; Safari em aparelho físico ainda requer conferência.
O comportamento de restauração de cookies de sessão é documentado pela
[MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#expiresdate).
