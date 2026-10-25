# Notificações

A notificação principal é uma só: "Beatriz pagou R$ 40,00 pra você", enviada a quem pagou a despesa quando outra pessoa marca a própria parte como paga.

**Quando avisar:**

| Evento | Quem é avisado |
| --- | --- |
| Alguém marca a própria parte como paga | Quem pagou a despesa (é a notificação da lista, com botões de confirmar) |
| Alguém registra um acerto pelo cartão do Meu saldo | A outra pessoa do acerto (quem recebe confirma ou diz "Não recebi"; "Não recebi" avisa quem pagou) |
| Alguém envia comprovante depois | A outra pessoa do pagamento |
| Quem recebe toca "Não recebi" | Quem marcou que pagou ("o pagamento não chegou") |
| Um admin exclui o split | Todos que estavam no split, menos quem excluiu ("Lucas excluiu o split Churras de sábado"; abre a explicação) |

**Canais (Sua conta → Notificações):**

- **Push no celular:** só existe no app nativo. No navegador a opção nem aparece, porque web push no celular é instável (no iPhone exige instalar o site na tela inicial) e prometer o que não chega é pior que não oferecer.
- **No app:** a lista do sino. Desligado, o sino some do cabeçalho.
- **Por e-mail:** para o e-mail da conta; indisponível para convidado. **Na v1 a opção fica escondida** até existir um domínio de remetente (decisão 10). Quando entrar: Resend, avisos da mesma pessoa em até 10 minutos agrupados num e-mail, resumo com botão "Ver no app" e sem foto do comprovante.
- Os três vêm ligados por padrão.

**Lista:** item com avatar, título, "despesa · split · com/sem comprovante" e o estado ("· confirmado", "· você contestou"). Itens não lidos têm destaque. O sino mostra a contagem (até "9+"). Abrir um item marca como lido; existe "Marcar todas como lidas".

**Regra-chave: o destaque vem do caminho; a pendência vem do estado.**

- **Destaque** (o banner "Beatriz marcou que pagou R$ 40,00" no topo do detalhe) só aparece quando você **chegou pela notificação**. É um parâmetro de navegação (`hlShare`), não um dado. Sair do detalhe limpa o parâmetro: voltar à mesma despesa pela lista de transações não mostra o banner.
- **Pendência** ("falta você confirmar") é um dado da despesa (`pendConf`). Ela aparece em qualquer caminho: na linha da parte, com Confirmar e Não recebi, e no aviso "1 pagamento p/ conferir" da lista.
- Com o banner aberto, os botões da linha daquela pessoa ficam ocultos, para não haver duas ações iguais na tela.
- Depois de confirmar ou contestar pelo banner, ele mostra o resultado ("Você confirmou o recebimento"). Se depois o pagamento for marcado como recebido manualmente, a contestação é resolvida e o aviso "Você avisou que não recebeu" não aparece mais.

**Por que separar:** quando o destaque dependia do estado, o banner aparecia toda vez que a despesa era aberta, mesmo sem notificação nova, e não sumia depois de resolvido. Com a separação, o banner responde a "por que estou vendo isto agora" e a pendência responde a "o que falta fazer".
