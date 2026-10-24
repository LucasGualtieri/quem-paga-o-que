# Saldo, pagamentos, comprovantes e confirmação

Marcar como pago vale na hora (atualização otimista); quem recebe pode confirmar ou dizer "Não recebi", e aí o pagamento volta a ficar pendente. Não há estado "a confirmar" separado nem confirmação automática por prazo.

**Aba Saldo:**

- No topo, "Seu saldo neste split": verde = a receber, vermelho = deve, cinza = quitado. Ao mudar, o número faz um fade com 4 px de subida (nada de contador girando).
- Um cartão por pessoa. O seu vem **primeiro, aberto e com fundo `--me-soft`**; os outros vêm minimizados, ordenados pelo tamanho do saldo. Botão "Expandir todos" / "Minimizar todos".
- Cartão fechado mostra nome, saldo e resumo ("deve a 2 pessoas · recebe de 1 pessoa", "1 resolvido", "Tudo certo com todo mundo").
- Cartão aberto lista as dívidas **reais de cada par** (`M`): "Você deve para Beatriz −R$ 235,00", "Catarina te deve +R$ 84,50". Botões: "Marcar como pago" (quem deve) ou "Recebi" (quem recebe).
- Pagamento registrado vira linha **resolvida** no cartão das duas pessoas: cinza, tracejada, "Resolvido · agora · com comprovante", com Desfazer e ícone de câmera para anexar comprovante.
- Vale para o acerto feito no Saldo e para a parte de despesa paga em Minha visão ou no detalhe (essa mostra também o nome da despesa: "Resolvido · agora · Pizza").
- **A linha fica no lugar:** o cartão agrupa tudo o que é com a mesma pessoa (o que falta e o que já foi resolvido), na ordem de entrada no split. Marcar como pago só troca o estado da linha; nada pula para o fim (decidido em 24/10/2026).

**Abas do split, nesta ordem:** Transações · Minha visão · Saldo · Pessoas (decidido em 24/10/2026).

**Aba Minha visão:**

- Resumo: Devo, Já paguei, A receber.
- "O que eu devo": uma linha por despesa. Ao pagar, a linha **fica no lugar** e troca o selo de "Pendente" para "Pago", com Desfazer e "Enviar comprovante". Não existe seção separada de "já pagos".
- Acertos feitos pelo Saldo aparecem como "Acerto de contas". Se o seu saldo zerou por acertos, as partes que restam aparecem como "Quitado no acerto".
- "O que tenho a receber": uma linha por pessoa e despesa, com "Recebi" e Desfazer.

**Comprovante:**

- **Desligado por padrão.** Com a preferência "Perguntar sobre comprovante ao marcar como pago" ligada, marcar pago ou recebido abre uma folha para anexar foto (opcional).
- Com a preferência desligada, a marcação é direta. Dá para anexar depois pelo botão "Enviar comprovante" ou pelo ícone de câmera, enquanto não houver comprovante. Quem recebe é avisado.
- **Só imagem** (foto ou print). O app reduz para no máximo 1600 px e regrava em JPEG de até 1 MB, sem metadados; o servidor recusa outro tipo ou mais de 2 MB.
- **Quem vê:** o split escolhe, em Pessoas, "Todo o split" (padrão) ou "Só os envolvidos e admins". Quem não pode ver enxerga só "com comprovante".
- **Prazo:** fica guardado no máximo 15 dias e é apagado quando o split é finalizado, quando o pagamento é desfeito ou com "Não recebi". Depois do prazo, a linha mostra "comprovante expirado" e não aceita outro. A folha de anexar avisa: "Comprovantes ficam guardados por 15 dias." (decisão 9)

**Confirmação de quem recebe:**

1. Beatriz marca a parte dela como paga numa despesa que você pagou. A parte já conta como paga e fica com `pendConf[bia]`.
2. Você recebe a notificação e vê "1 pagamento p/ conferir" na despesa.
3. "Confirmar recebimento" tira a pendência. "Não recebi" desfaz a parte paga, apaga o comprovante e avisa a Beatriz.
4. Se você mesmo marcar "Recebi", não há pendência: quem recebe já está confirmando. Isso também resolve notificações contestadas antes, que somem do destaque.

**Toast:** pílula discreta com check, cerca de 4 s, com Desfazer quando a ação pode ser revertida ("Pagamento registrado · avisamos Beatriz", "Recebimento registrado", "Despesa adicionada").
