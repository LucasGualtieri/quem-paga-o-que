# Despesas e modos de divisão

Uma despesa se lança em uma tela só: a divisão abre dentro do formulário, nunca em tela separada.

**Campos:** descrição (obrigatória), valor (obrigatório, maior que zero), Pago por (escolha única; padrão é você), Dividir com, Como dividir e "Mais detalhes" (data, tags, descrição longa, comprovante, nota). Sem tag escolhida, a despesa recebe "Outros". O comprovante da despesa (foto, como uma nota fiscal) é só imagem, qualquer participante vê e fica guardada no máximo 15 dias (apagada ao finalizar o split; decisão 9). Tags: Comida, Bebidas, Transporte, Hospedagem, Diversão e Outros.

**Campos em R$** (valor da despesa, valor exato por pessoa e valor do item) funcionam como no caixa eletrônico: o primeiro dígito é centavo e cada dígito novo empurra os outros uma casa (1 → 0,01; 12 → 0,12; 1234 → 12,34); apagar faz o caminho inverso. Teclado numérico, vírgula e milhar sempre no lugar (decidido em 24/10/2026).

**Dividir com:**

- Lista de pessoas em linhas, **sem checkbox**: selecionada = anel no avatar + selo de check. Todos vêm marcados.
- A lista vem aberta quando o split tem até 5 pessoas e recolhida quando tem mais; dá para recolher e expandir.

| Modo | Como funciona | Quando não deixa salvar |
| --- | --- | --- |
| Igualmente | Parte igual; centavos que sobram vão 1 a 1 na ordem de entrada no split (`joinOrder`) | Ninguém selecionado |
| Frações | Peso por pessoa (ex.: pizza de 8 pedaços: 2, 1, 3, 2) | Soma dos pesos igual a zero |
| Porcentagem | % por pessoa, já preenchida igualmente | Soma diferente de 100% |
| Valor exato | R$ por pessoa | Soma diferente do valor total |
| Dividir por itens | Cada item com quem consumiu (ex.: mercado, restaurante) | Ver abaixo |

Com erro de divisão, a mensagem é "A divisão não fecha com o valor. Ajuste os valores acima." e a prévia "Quanto fica para cada um" acompanha os valores em tempo real.

**Dividir por itens:**

- Cada item tem nome, valor, quem consumiu (avatares com nome embaixo; seu nome em negrito), botão "Todos" e o próprio modo de divisão (igualmente, frações, %, valor exato).
- Itens podem ser minimizados para uma linha de resumo. Com erro, os itens com problema reabrem sozinhos.
- Mais de 5 pessoas: os avatares do item rolam na horizontal e aparece "Ver todos (N)".
- **Resto da compra:** se o valor total for maior que a soma dos itens, a diferença é dividida entre as pessoas escolhidas no Resto, com modo próprio. Se o valor ficar vazio, o total passa a ser a soma dos itens.
- Não salva se: não houver itens; algum item estiver sem valor, sem pessoas ou com divisão que não fecha; os itens somarem mais que o total; houver resto sem ninguém para pagar.

**Detalhe da despesa:** valor, quem pagou, parte de cada um (com estado pago, comprovante e ações conforme as permissões), itens se houver, comprovante, nota e **Histórico de edição** (criação, mudança de valor de X para Y, edições, pagamentos e comprovantes).

**Depois de salvar:** volta para Transações com a nova despesa destacada, toast "Despesa adicionada" com Desfazer e o saldo animando para o novo valor. Excluir pede confirmação e também oferece Desfazer.

**Excluir com pagamentos:** bloqueado enquanto houver parte paga ou pagamento esperando confirmação ("Esta despesa tem pagamentos marcados. Desmarque-os antes de excluir."). Ao excluir, as notificações da despesa somem da lista; Desfazer traz a despesa e as notificações de volta.

**Duas pessoas editando:** ao salvar, se outra pessoa salvou a despesa antes, aparece "Beatriz alterou esta despesa enquanto você editava." com "Ver a versão nova" ou "Salvar a minha por cima". As duas edições entram no Histórico. Marcar parte paga, confirmar e anexar comprovante não são edições da despesa e não geram esse aviso.

**Transações:** agrupadas por dia, com busca (nome ou tag) e dois filtros em menu suspenso: Pessoas (quem pagou ou participa) e Tags, com contagem por opção. Quem pagou vê "1 pagamento p/ conferir" na despesa enquanto houver pendência de confirmação.
