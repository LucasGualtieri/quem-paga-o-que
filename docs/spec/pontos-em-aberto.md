# Pontos em aberto

O protótipo não responde às perguntas abaixo. Quem implementar deve decidir com o Lucas antes de codar a parte afetada. Feche cada decisão antes da fase indicada (fases em `docs/plan.md`).

Os pontos de partida são sugestões para a conversa, não decisões tomadas. Ao decidir, registre a resposta aqui, mude o status para **Decidido** e atualize o arquivo da spec afetado, que é a fonte da verdade.

| # | Decisão | Fechar antes de | Ponto de partida sugerido | Status |
| --- | --- | --- | --- | --- |
| 1 | Ordem de distribuição dos centavos | Fase 1 | Ordem de entrada no split, gravada em cada participante | **Decidido** |
| 2 | Valor editado em despesa com partes pagas | Fase 1 | Guardar o valor pago, não só "pago"; a diferença volta a pendente | **Decidido** |
| 3 | Duas pessoas escolhem o mesmo nome em "Quem é você?" | Fase 3 | O nome trava para a primeira pessoa; um admin pode liberar | **Decidido** |
| 4 | Último admin sair ou deixar de ser admin | Fase 3 | Sempre ao menos um admin, como a spec sugere | **Decidido** |
| 5 | Convidado salva com conta Google que já existe no app (fora da spec) | Fase 4 | Entra na conta existente e oferece trazer os splits do aparelho | Em aberto |
| 6 | Validade dos links de convite e de recuperação; como revogar | Fase 4 | Sem prazo; admin gera novo código, e o dono revoga o link de recuperação em Sua conta | Em aberto |
| 7 | Excluir despesa com partes pagas ou pendência de confirmação; o que acontece com as notificações | Fase 5 | Bloquear até desmarcar os pagamentos, como em remover participante; nenhuma notificação fica órfã | Em aberto |
| 8 | Duas pessoas editando a mesma despesa ao mesmo tempo | Fase 5 | Aviso de conflito por número de versão, em vez de "última gravação vence" | Em aberto |
| 9 | Comprovantes: onde ficam, por quanto tempo e quem vê (LGPD) | Fase 6 | Só as duas pessoas do pagamento e os admins veem; retenção a definir com quem cuida de privacidade | Em aberto |
| 10 | Provedor de e-mail transacional e remetente | Fase 7 | Resend com domínio próprio, chave em secret das Functions | Em aberto |

## Respostas

### 1. Ordem de distribuição dos centavos — decidido em 22/10/2026

Cada participante recebe um `joinOrder` estável ao entrar no split. No modo Igualmente, os centavos que sobram vão 1 a 1 nessa ordem, nunca na ordem da lista da despesa. Em Frações e %, o empate no maior resto também desempata por `joinOrder`. O resultado é idêntico em todos os aparelhos. Spec atualizada: `02-modelo-de-dados-e-calculo.md` e `05-despesas-e-divisao.md`.

### 2. Valor editado em despesa com partes pagas — decidido em 22/10/2026

`paid[pessoa]` guarda os centavos pagos, não um booleano.
- Se a parte nova for maior que o pago, a diferença volta a ser pendente.
- Se for menor, o excedente vira crédito da pessoa com quem pagou a despesa.

Spec atualizada: `02-modelo-de-dados-e-calculo.md`.

### 3. Duas pessoas escolhem o mesmo nome — decidido em 22/10/2026

- **O nome trava para a primeira pessoa.** Em "Quem é você?", um nome já escolhido continua na lista, desabilitado, com "Já escolhido". Quem chega escolhe outro ou toca em "Não estou na lista".
- **Só admin libera.** Em Pessoas, o admin toca "Liberar nome" na linha da pessoa: o nome volta a ficar livre, e as despesas, partes e o histórico continuam com ele. Quem estava ligado ao nome deixa de ver o split. Liberar o nome também tira o admin daquele participante, para ninguém herdar o papel ao escolher o nome depois.
- **Nomes repetidos são bloqueados** no split, ao criar o split e em "Não estou na lista". A comparação ignora maiúsculas, acentos e espaços extras ("Lucas", "lúcas " e "LUCAS" são o mesmo nome). Mensagem: "Já tem um Lucas aqui. Diferencie, ex.: Lucas G."

Spec atualizada: `03-contas-e-convidados.md` e `04-splits-papeis-permissoes.md`.

### 4. Último admin sair ou deixar de ser admin — decidido em 22/10/2026

- **Sempre ao menos um admin.** Um admin pode deixar de ser admin, ou sair do split, só se restar outro admin. O último fica travado, com a mensagem "Promova outra pessoa a admin antes".
- **"Sair do split" existe para todos** (membro e admin) e **desvincula**: o nome continua no split, com despesas e histórico intactos, e volta a ficar livre; quem saiu deixa de ver o split. **Só deixa sair com saldo zero** neste split ("Quite suas contas antes de sair"), para ninguém sair devendo.
- **Onde:** "Sair do split" fica no menu de três pontos do split; "Deixar de ser admin" fica na sua própria linha em Pessoas.
- **Único admin que perde o acesso** (convidado sem link de recuperação): nada de automático na v1. O lembrete de salvar a conta e o link de recuperação cobrem esse caso; os membros continuam usando o split, só sem convidar, promover ou finalizar.

Spec atualizada: `04-splits-papeis-permissoes.md`.
