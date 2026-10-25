# Design: tema, acessibilidade, idioma e desktop

Os tokens da Folha de estilo são a referência; nenhuma cor deve ser escrita direto no componente.

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--accent` | #5534E0 | #A08CFF | Ação principal, seleção, botão flutuante "+" de nova despesa |
| `--pos` / `--pos-soft` | #0B7A43 / #DFF3E7 | #52D38E / #14301F | A receber |
| `--neg` / `--neg-soft` | #B53A08 / #FCE9DE | #F0642E / #3A1910 | Deve, erros e excluir (no escuro, o mesmo tom do claro, clareado para o contraste; 25/10/2026). Valor negativo sempre com "−" |
| `--zero` / `--zero-soft` | #5F616B / #EAEAE6 | #A0A1AC / #2A2A31 | Quitado, resolvido |
| `--me-soft` | #F6F3FF | #221D3A | Fundo da sua linha (Pessoas, detalhe da despesa) |
| `--bg` / `--surface` | #F3F3F0 / #FFFFFF | #111114 / #1C1C21 | Fundo e cartões |
| `--sun` | #FFCF3F | #FFD25A | Só ilustração: o "+" dos estados vazios e a moeda "R$" do login. Não é o botão flutuante |

**Tipografia:** Bricolage Grotesque (títulos e valores) e Figtree (texto e interface).

**Acessibilidade:**

- Contraste AA nos dois temas; alvos de toque de pelo menos 44 px.
- Cor nunca é o único sinal: valores levam sinal (+ / −), selos têm ícone (relógio = pendente, check = pago) e texto ("Pendente", "Pago", "Quitado"); resolvidos são cinza **e** tracejados.
- Seleção de pessoas sem checkbox usa anel + selo de check + `aria-pressed`; interruptores usam `role="switch"`.
- Com `prefers-reduced-motion`, sem animação no saldo e no toast.

**Idioma:** PT-BR padrão e EN completo. Moeda sempre em R$ ("R$ 1.200,00"; em EN, "R$ 1,200.00").

**Explicações "?"** (25/10/2026): ao lado do que não é óbvio ("Liberar nome", "Ver como", "compensado no saldo"), um "?" abre um balão curto; no celular por toque (tocar fora fecha), no computador também ao passar o mouse. O texto fica ligado ao botão para leitores de tela. Dentro de uma frase, o "?" tem o tamanho da letra, fica centrado na linha e não vai sozinho para a linha de baixo. Na explicação de "Ver como", a palavra "admins" aparece no lilás do selo de Admin.

**Botão "+" flutuante:** a lista tem folga no fim para o último cartão sempre subir acima dele.

**Selos à direita** (Membro, Admin): a legenda ao lado quebra linha em vez de passar por baixo do selo.

**"Eu" nas listas:** avatar redondo igual ao dos outros, com o nome em negrito embaixo. Sem anel extra, sem bolinha (parece notificação) e sem avatar quadrado.

**Desktop:** a mesma interface do celular, numa coluna centralizada (até 560 px). Sem barra lateral nem colunas lado a lado; mesmas telas, regras, permissões e ações. Não existe matriz. (Decidido em 24/10/2026; o `reference/design/Desktop.dc.html` não vale mais.)
