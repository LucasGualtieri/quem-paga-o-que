# Splits, papéis e permissões

Cada split tem dois papéis: **admin** (pode haver vários; quem cria é admin) e **membro**. As permissões valem sempre no servidor, não só na tela.

| Ação | Quem pode | Observação |
| --- | --- | --- |
| Lançar despesa | Qualquer participante | Pode lançar despesa paga por outra pessoa (campo "Pago por"). |
| Editar ou excluir despesa | Quem lançou (`author`) ou admin | Os outros veem "Só X (quem lançou) ou um admin pode editar". Toda edição entra no histórico. |
| Marcar uma parte de despesa como paga | A própria pessoa, quem pagou a despesa ou admin | Quem pagou nunca tem parte a marcar. |
| Registrar acerto nos cartões do Saldo | Quem está na linha (deve ou recebe) ou admin | Vale em qualquer cartão, não só no seu. |
| Desfazer acerto registrado | As duas pessoas do acerto ou admin |  |
| Anexar comprovante depois | As duas pessoas do pagamento (na parte de despesa, também admin) | Só enquanto não houver comprovante. |
| Convidar, promover, tirar admin, remover | Só admin. "Tornar admin" só aparece para quem já entrou (escolheu o nome) | Membro vê a aba Pessoas com cadeado e o texto "fale com…" (abaixo). Admin age sobre os outros; sobre si mesmo, ver "Deixar de ser admin". |
| Liberar nome | Só admin | Desliga a pessoa do nome: o nome volta a ficar livre em "Quem é você?"; despesas, partes e histórico continuam com ele. Também tira o admin daquele participante. |
| Deixar de ser admin | O próprio admin | Só se restar outro admin. Fica na sua linha em Pessoas. |
| Sair do split | Qualquer participante | Só com saldo zero neste split; admin, só se restar outro admin. Fica no menu de três pontos. |
| Finalizar e reabrir split | Só admin | No menu, "Finalizar" aparece desabilitado para membro. |

**Sempre ao menos um admin.** Ninguém deixa o split sem admin: o último admin não pode deixar de ser admin nem sair ("Promova outra pessoa a admin antes"). Se o único admin perder o acesso (convidado sem link de recuperação), nada muda automaticamente na v1: o split continua para os membros, só sem convidar, promover ou finalizar.

**Sair do split** desvincula você do seu nome: o nome continua no split, com despesas e histórico, volta a ficar livre e você deixa de ver o split. Com saldo diferente de zero, a ação é bloqueada com "Quite suas contas antes de sair".

**Texto para membro na aba Pessoas**, conforme a quantidade de admins: nenhum → "fale com um admin"; 1 → o nome; 2 ou 3 → "Beatriz, Catarina ou Fellipe"; mais de 3 → "Beatriz, Catarina ou outro admin".

**Menu de três pontos do split:** Convidar (admin vai para Pessoas; membro copia o link), Finalizar ou Reabrir, Sair do split e Sua conta.

**Remover participante** é bloqueado em dois casos, com a mensagem na própria linha: quando a pessoa tem saldo diferente de zero ("Quitem as contas antes de remover") e quando ela aparece em alguma despesa ("Edite-as antes de remover").

**Split finalizado:**

- Ninguém lança, edita nem marca pagamentos. Tudo fica só para leitura, com o aviso no topo.
- Pendências continuam visíveis. Antes de finalizar, a confirmação lista o que ficou pendente (com os pagamentos simplificados) e o botão vira "Finalizar mesmo assim".
- Admin pode reabrir quando quiser.
- Na home, splits finalizados ficam no filtro "Finalizados" e não entram no total "No total, você deve/recebe".

**Criar split:** nome, capa (emoji ou foto, opcional), o seu nome e os outros participantes só pelo nome ("Só o nome basta"), sem nomes repetidos (ver Contas). Depois aparece a tela com link de convite, código e Compartilhar.
