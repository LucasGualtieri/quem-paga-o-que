# Saldo, pagamentos, comprovantes e confirmação

Marcar como pago vale na hora (atualização otimista); quem recebe pode confirmar ou dizer "Não recebi", e aí o pagamento volta a ficar pendente. Não há estado "a confirmar" separado nem confirmação automática por prazo.

**Abas do split, nesta ordem:** Despesas · Meu saldo · Pessoas. A antiga aba Saldo e a Minha visão viraram uma só, **Meu saldo**, com o ícone de setas trocadas (decidido em 24 e 25/10/2026). Fica em `/saldo`; links antigos para `/eu` levam para lá.

**Aba Meu saldo** (revista em 24/10/2026):

- No topo, "Seu saldo neste split": verde = a receber, vermelho = deve, cinza = quitado. Ao mudar, o número faz um fade com 4 px de subida (nada de contador girando).
- Abaixo, **um cartão por pessoa do split** com o saldo do par (você ↔ ela), calculado de todas as despesas e acertos pelo `@qpq/calc`. Ordem: primeiro quem você deve, depois quem te deve (maiores primeiro), quitados por último. Botão "Expandir todos" / "Minimizar todos"; os cartões começam fechados.
- **Você deve:** "Copiar Pix" (se a pessoa cadastrou chave; Pix copia e cola com o valor do par) e "Marcar como pago", que paga **o saldo do par num acerto só**.
- **Te deve:** "Recebi", que registra o acerto do par já confirmado.
- **Quitado:** cartão neutro (sem sombra, contorno fino, selo "Quitado"), sem botões.
- **Cartão aberto:** as despesas que formam o saldo do par, por data ("Pizza · você devia para Beatriz −R$ 30,00", "Gasolina · Beatriz te devia +R$ 20,00"), e os acertos já feitos como **linhas resolvidas** (cinza, tracejadas, com Desfazer e câmera para ver ou enviar comprovante). Parte que não pesa mais porque o par já zerou ou virou para o outro lado aparece como "compensado no saldo".
- **Pagamento parcial:** cada despesa aberta em que você deve tem o próprio "Marcar como pago" (e em que te devem, "Recebi"); o detalhe da despesa continua funcionando igual. Valor livre fica fora desta versão.
- **A linha fica no lugar:** pagar uma parte só troca o estado da linha dentro do cartão; nada pula para o fim (decidido em 24/10/2026).
- **Cada um só vê o que é com ele:** pares entre outras pessoas não aparecem. **Admin** tem no topo "Ver como: Você ▾" para ver o Meu saldo de qualquer pessoa, com a faixa "Vendo como Beatriz · Voltar para você", e pode registrar acertos e confirmar por ela.

**Comprovante:**

- **Desligado por padrão.** Com a preferência "Perguntar sobre comprovante ao marcar como pago" ligada, marcar pago ou recebido abre uma folha para anexar foto (opcional).
- Com a preferência desligada, a marcação é direta. Dá para anexar depois pelo botão "Enviar comprovante" ou pelo ícone de câmera, enquanto não houver comprovante. Quem recebe é avisado.
- **Só imagem** (foto ou print). O app reduz para no máximo 1600 px e regrava em JPEG de até 1 MB, sem metadados; o servidor recusa outro tipo ou mais de 2 MB.
- **Quem vê:** o split escolhe, em Pessoas, "Todo o split" (padrão) ou "Só os envolvidos e admins". Quem não pode ver enxerga só "com comprovante".
- **Prazo:** fica guardado no máximo 15 dias e é apagado quando o split é finalizado, quando o pagamento é desfeito ou com "Não recebi". Depois do prazo, a linha mostra "comprovante expirado" e não aceita outro. A folha de anexar avisa: "Comprovantes ficam guardados por 15 dias." (decisão 9)

**Confirmação de quem recebe** (parte de despesa e acerto):

1. Beatriz marca a parte dela como paga numa despesa que você pagou. A parte já conta como paga e fica com `pendConf[bia]`.
2. Você recebe a notificação e vê "1 pagamento p/ conferir" na despesa.
3. "Confirmar recebimento" tira a pendência. "Não recebi" desfaz a parte paga, apaga o comprovante e avisa a Beatriz.
4. Se você mesmo marcar "Recebi", não há pendência: quem recebe já está confirmando. Isso também resolve notificações contestadas antes, que somem do destaque.
5. **Acerto** (24/10/2026): "Marcar como pago" no cartão vale na hora para as duas pessoas e fica "esperando Beatriz confirmar". Quem recebe vê, no cartão, "Lucas registrou um pagamento de R$ 10,00" com Confirmar e "Não recebi". "Não recebi" apaga o acerto (e o comprovante) e avisa quem pagou. Admin pode confirmar por quem recebe.

**Toast:** pílula discreta com check, cerca de 4 s, com Desfazer quando a ação pode ser revertida ("Pagamento registrado · avisamos Beatriz", "Recebimento registrado", "Despesa adicionada").
