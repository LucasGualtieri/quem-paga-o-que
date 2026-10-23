# Saldo, pagamentos, comprovantes e confirmação

Marcar como pago vale na hora (atualização otimista); quem recebe pode confirmar ou dizer "Não recebi", e aí o pagamento volta a ficar pendente. Não há estado "a confirmar" separado nem confirmação automática por prazo.

**Aba Saldo:**

- No topo, "Seu saldo neste split": verde = a receber, vermelho = deve, cinza = quitado. Ao mudar, o número faz um fade com 4 px de subida (nada de contador girando).
- Um cartão por pessoa. O seu vem **primeiro, aberto e com fundo `--me-soft`**; os outros vêm minimizados, ordenados pelo tamanho do saldo. Botão "Expandir todos" / "Minimizar todos".
- Cartão fechado mostra nome, saldo e resumo ("deve a 2 pessoas · recebe de 1 pessoa", "1 resolvido", "Tudo certo com todo mundo").
- Cartão aberto lista as dívidas **reais de cada par** (`M`): "Você deve para Beatriz −R$ 235,00", "Catarina te deve +R$ 84,50". Botões: "Marcar como pago" (quem deve) ou "Recebi" (quem recebe).
- Pagamento registrado vira linha **resolvida** no cartão das duas pessoas: cinza, tracejada, "Resolvido · agora · com comprovante", com Desfazer e ícone de câmera para anexar comprovante.

**Aba Minha visão:**

- Resumo: Devo, Já paguei, A receber.
- "O que eu devo": uma linha por despesa. Ao pagar, a linha **fica no lugar** e troca o selo de "Pendente" para "Pago", com Desfazer e "Enviar comprovante". Não existe seção separada de "já pagos".
- Acertos feitos pelo Saldo aparecem como "Acerto de contas". Se o seu saldo zerou por acertos, as partes que restam aparecem como "Quitado no acerto".
- "O que tenho a receber": uma linha por pessoa e despesa, com "Recebi" e Desfazer.

**Comprovante:**

- **Desligado por padrão.** Com a preferência "Perguntar sobre comprovante ao marcar como pago" ligada, marcar pago ou recebido abre uma folha para anexar foto (opcional).
- Com a preferência desligada, a marcação é direta. Dá para anexar depois pelo botão "Enviar comprovante" ou pelo ícone de câmera, enquanto não houver comprovante. Quem recebe é avisado.

**Confirmação de quem recebe:**

1. Beatriz marca a parte dela como paga numa despesa que você pagou. A parte já conta como paga e fica com `pendConf[bia]`.
2. Você recebe a notificação e vê "1 pagamento p/ conferir" na despesa.
3. "Confirmar recebimento" tira a pendência. "Não recebi" desfaz a parte paga, apaga o comprovante e avisa a Beatriz.
4. Se você mesmo marcar "Recebi", não há pendência: quem recebe já está confirmando. Isso também resolve notificações contestadas antes, que somem do destaque.

**Toast:** pílula discreta com check, cerca de 4 s, com Desfazer quando a ação pode ser revertida ("Pagamento registrado · avisamos Beatriz", "Recebimento registrado", "Despesa adicionada").
