# Como ler este documento

O canvas do protótipo é a fonte da verdade **visual**; este documento é a fonte da verdade das **regras**. Quando os dois divergirem, vale o que está aqui e o canvas deve ser corrigido.

- **Main (390 px)**: protótipo navegável do app no celular. Todas as telas e estados vêm dele.
- **Desktop (1440 px)**: o mesmo app em layout de duas colunas (transações + saldo lado a lado). Mesmas regras, só muda a disposição.
- **Folha de estilo**: tokens de cor, tipografia e componentes aprovados. Só o que está lá deve ser implementado como componente.
- **Galerias (Telas 1–5)**: o Main renderizado em estados fixos para revisão. Não são telas novas.

O código do protótipo serve de referência de layout e comportamento, não de arquitetura. Estado em memória, chaves por preset e dados fixos são andaime (próxima seção).
