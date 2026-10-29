# Modelo de dados e cálculo de saldos

Valores são sempre **inteiros em centavos**; só a tela formata em R$. Saldo nunca é guardado: é recalculado a partir das despesas e pagamentos.

| Entidade | Campos essenciais |
| --- | --- |
| Split | `id`, `name` (até 2 linhas na tela), `emoji`, `photo` (capa opcional), `status` open \| done, `doneAt`, `members[]` (cada um com `joinOrder`, a ordem de entrada no split), `admins[]`, `code` de convite, `proofVisibility` all \| involved (quem vê comprovantes; padrão all) |
| Despesa | `name`, `amount`, `payer` (quem pagou), `members[]` (com quem dividir), `mode` equal \| frac \| pct \| exact \| items, `w` (pesos por pessoa), `items[]`, `rest[]`, `restMode`, `restW`, `date`, `tags[]`, `note`, `longDesc`, `receipt`, `author`, `history[]`, `installments` (`count`, `first`: parcelada) e `advanced[pessoa]` (parcelas antecipadas) |
| Parte quitada (por despesa) | `paid[pessoa]` (centavos pagos, não um booleano), `proof[pessoa]`, `pendConf[pessoa]` |
| Pagamento de acerto (entre duas pessoas) | `from`, `to`, `amount`, `when`, `proof` |
| Comprovante (de pagamento e da despesa) | Só imagem, guardados no máximo 15 dias e apagados ao finalizar o split; depois do prazo ficam marcados como expirados (decisão 9) |
| Notificação | `who`, `split`, `txId`, `amount`, `proof`, `when`, `read`, `status` new \| confirmed \| disputed |
| Preferências do usuário | `push`, `inapp`, `email`, `selfName`, `askProof`, `theme`, `lang` |

**Existem dois jeitos de quitar, e os dois coexistem:**

1. **Parte de uma despesa** (`paid[pessoa]` = centavos pagos, igual à parte no momento em que foi marcada): feito em Minha visão ou no detalhe da despesa. Tira aquela parte da dívida.
2. **Pagamento de acerto** (registro em `payments`): feito nos cartões por pessoa do Meu saldo (o saldo do par de uma vez). Abate um valor entre duas pessoas sem apontar despesa.

**Cálculo (`shares` e `ledger` no Main):**

1. Parte de cada um por despesa:
   - Igualmente: divide os centavos e distribui o resto, 1 centavo por vez, na ordem de entrada no split (`joinOrder`), nunca na ordem da lista da despesa. Assim o resultado é o mesmo em todos os aparelhos.
   - Frações e %: arredonda para baixo e entrega os centavos que sobram para quem teve a maior parte fracionária (maior resto); empate no resto desempata por `joinOrder`. Em %, o total é o valor vezes a soma das porcentagens; só vale salvar com soma 100%.
   - Valor exato: cada um informa o seu; só vale salvar se a soma bater com o total.
   - Por itens: cada item é dividido entre quem consumiu, no modo do item; o que sobra (total menos itens) vai para o "Resto da compra", no modo do resto.
2. Dívida bruta `P[a][b]`: soma, nas despesas pagas por `b`, de `parte[a] − paid[a]` (numa despesa parcelada, `parte[a]` é só as parcelas vencidas até hoje, no horário de Brasília, mais a próxima, ou as antecipadas; o resto fica em `F[a][b]`, "parcelas futuras", fora do saldo) (o que falta de cada parte); menos os pagamentos de acerto de `a` para `b`. Se `paid[a]` passar da parte (a despesa foi editada para menos), o excedente vira crédito: entra em `P[b][a]`.
3. Dívida líquida do par `M[a][b] = max(0, P[a][b] − P[b][a])`: é o que aparece em cada cartão do Meu saldo.
4. Saldo de cada pessoa `net`: soma do que tem a receber menos o que deve. É o número grande do topo e o de cada cartão.
5. Sugestão simplificada `sug` (maiores devedores pagam aos maiores credores): usada **apenas** no resumo da tela Finalizar split. Veja Decisões para o motivo.

**Valor editado em despesa com partes pagas (decidido em 22/10/2026):** `paid[pessoa]` guarda os centavos pagos. Se a edição aumenta a parte de alguém que já pagou, a diferença volta a ser pendente: a linha mostra "Pendente" com o valor que falta. Se a edição diminui a parte, o que foi pago a mais vira crédito dessa pessoa com quem pagou a despesa. A mudança entra no Histórico de edição.
