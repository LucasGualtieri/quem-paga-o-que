# Quem Paga O Quê? — pacote do Claude Design (só leitura)

Fonte da verdade **visual**. O código do protótipo é referência de layout e comportamento, não de arquitetura. As regras de produto ficam em `docs/spec/` (fonte da verdade das regras), não aqui. O fluxo de trabalho está em `CLAUDE.md` e `docs/plan.md`.

## Conteúdo
- `design/Main.dc.html`: protótipo mobile (390 px) com todas as telas, estados, textos PT/EN e a lógica de cálculo (`shares`, `ledger`). O motor real fica em `packages/calc` e difere de propósito (ordem de entrada, centavos pagos).
- `design/Desktop.dc.html`: layout desktop (1440 px).
- `design/Estilo.dc.html`: tokens de cor (claro/escuro), tipografia e componentes aprovados.
- `design/Telas_*.dc.html`: galerias que só renderizam o Main em estados fixos (presets). Não são telas novas.
- `design/index.html`: atalhos para todas as telas.
- `design/support.js`: runtime do canvas, que faz os `.dc.html` renderizarem fora do Claude Design. Carrega React e Babel do jsDelivr, então precisa de internet. **Não vai para o app.**
- `design/canvas.json`: organização do canvas; pode ser ignorado.

Os arquivos rodam num runtime de protótipo (tags `<x-dc>`, `<sc-if>`, `<sc-for>`, `{{...}}`). Nada disso é copiado para o app; tudo o que a seção "Andaime do protótipo" (`docs/spec/01-andaime-do-prototipo.md`) lista também fica de fora.

## Ver as telas no navegador
Os arquivos precisam ser servidos por HTTP; abertos com duplo clique, as galerias não carregam.

```
node scripts/serve-reference.mjs
```

(Ou `cd reference/design && python3 -m http.server 8000`, se o Python tiver acesso à pasta.)

Ou, no Claude Code, use a configuração `prototipo` de `.claude/launch.json`. Depois abra http://localhost:8000.

O painel de Tweaks só existe dentro do canvas: para ver um estado específico, abra a galeria correspondente (Telas 1–5).
