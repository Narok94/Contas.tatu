# Conversa compartilhada da casa

`003_household_chat.sql` acrescenta somente `finance_v2.chat_messages` e seus índices.
Nenhuma tabela financeira, regra de cálculo, credencial ou sessão existente é alterada.
Migration aplicada em 01/10/2026 no `neondb` de Production, endpoint
`ep-mute-flower-b7tq5afc`, após confirmar o household e os dois usuários.

`GET /api/chat` retorna as últimas 100 mensagens em ordem cronológica, participantes
e `nextBefore`. `before` permite consultar todo o histórico; `q` busca conteúdo e
os detalhes do lançamento; `author` filtra pelo usuário que enviou ou confirmou.
Somente a identidade autenticada determina household e autor. A data vem do banco.
Nome do autor e detalhes da prévia ficam preservados como retrato da interação.

`POST /api/chat` recebe `{id,text,month}` e salva mensagem e resposta na mesma transação.
O UUID de envio evita mensagens duplicadas caso a resposta se perca. A interpretação
usa as categorias e cartões reais, pelo mesmo interpretador já utilizado no chat.
Mensagens livres também são salvas. Confirmação continua sendo explícita.

`POST /api/chat/confirm` recebe `{id,expectedRevision,preview?}`. Usa o serviço financeiro
existente. Seu transporte grava lançamento, prévia corrigida e recibo da confirmação
na mesma transação. Locks e revisão impedem confirmação duplicada entre usuários;
uma resposta perdida pode ser consultada/repetida sem lançar novamente. A prévia
original permanece no banco separadamente da prévia confirmada/corrigida. O recibo
preserva quem efetivamente confirmou, mesmo quando a mensagem foi de outra pessoa.
Falhas ou rollback não deixam mensagem marcada como salva.

O cliente carrega do servidor ao entrar, verifica atualizações a cada cinco segundos
e ao recuperar foco. Busca por autor/conteúdo e paginação permitem consultar compras
e lançamentos depois. Logout não exclui mensagens. Não existe rota de exclusão.
Histórico já perdido pelo antigo chat em memória não pode ser recuperado.

Validação isolada com os dois logins: histórico compartilhado, autor/data, logout e
relogin, idempotência de envio/confirmação, confirmação simultânea, correções,
rejeição de campos de identidade, isolamento por household e paginação.
