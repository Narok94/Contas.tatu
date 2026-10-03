# Contas por foto

No chat mobile, o atalho Foto abre câmera ou seleção de imagem. A foto é
processada no aparelho por Tesseract.js, carregado sob demanda. Não há upload,
persistência da foto ou alteração de backup. O leitor baixa seu motor e idiomas
português/inglês pela internet; uma falha permite tentar novamente ou preencher
manualmente. Imagens até 15 MB são reduzidas a 1800 pixels no maior lado para
limitar o uso de memória. Formatos que o navegador não consegue decodificar
exibem orientação para JPG/PNG. A leitura pode ser cancelada e tem limite de
90 segundos.

Cada linha é uma prévia independente: nome, parcela atual, total de parcelas,
valor da conta/parcela e mês de referência. O usuário pode corrigir ou descartar
qualquer linha. Somente Confirmar e adicionar chama a criação existente.
Uma linha já confirmada fica bloqueada para impedir novo envio por esse botão.
Não há salvamento em lote automático nem alteração de registros existentes.

Exemplo: Casas Bahia, 3/3, R$ 500, outubro/2026 cria um parcelamento de três
parcelas, total R$ 1500, início agosto/2026. Loja 100, 1/8, R$ 345 cria total
R$ 2760 a partir do mês escolhido. O início é calculado para que a parcela
informada corresponda ao mês escolhido. A prévia informa que o cronograma
inclui as parcelas anteriores; nenhum pagamento é marcado automaticamente.
Campos de parcela vazios criam uma conta simples pelo mesmo fluxo atual.
Números incertos precisam de revisão; o OCR não comprova a exatidão de uma conta.

Validação focada: tests/photo-accounts.test.ts cobre interpretação, correção e
comandos existentes. tests/photo-accounts-browser.cjs testa o build de produção
em 393×852 e 414×896 com OCR real sobre imagem sintética e rotas financeiras
simuladas: sem escrita antes da confirmação, edição, leitura inválida e retorno
manual. Não escreve no banco real. Captura de câmera em aparelho físico não é
verificada pelo teste automatizado.

API do leitor: [Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).
