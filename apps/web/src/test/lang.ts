// O jsdom diz que o navegador é "en-US"; os testes leem os textos em PT-BR (o idioma padrão).
Object.defineProperty(navigator, 'languages', { value: ['pt-BR'], configurable: true });
