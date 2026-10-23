# Quem Paga O Quê? — pacote do Claude Design (só leitura)

Fonte da verdade **visual**. O código do protótipo é referência de layout e comportamento, não de arquitetura. As regras de produto ficam em `docs/spec/` (fonte da verdade das regras), não aqui.

## Conteúdo
- `design/Main.dc.html`: protótipo mobile (390 px) com todas as telas, estados, textos PT/EN e a lógica de cálculo (`shares`, `ledger`).
- `design/Desktop.dc.html`: layout desktop (1440 px).
- `design/Estilo.dc.html`: tokens de cor (claro/escuro), tipografia e componentes aprovados.
- `design/Telas_*.dc.html`: galerias que só renderizam o Main em estados fixos (presets). Não são telas novas.
- `design/canvas.json`: organização do canvas; pode ser ignorado.

## Pendência
Todos os `.dc.html` carregam `./support.js`, que não veio neste pacote; sem ele, o protótipo não abre no navegador. Para resolver, exporte de novo pelo Claude Design (Export → Hand off to Claude Code) e substitua `reference/` inteira.
