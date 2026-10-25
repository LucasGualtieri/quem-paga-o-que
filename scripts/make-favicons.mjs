// Gera os PNGs do favicon a partir de apps/web/public/favicon.svg (Chromium do Playwright).
// 32 px: navegadores sem SVG; 180 px: ícone da tela inicial do iPhone (apple-touch-icon).
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('apps/web/public/favicon.svg', 'utf8');
const browser = await chromium.launch();
for (const [size, out, square] of [
  [32, 'apps/web/public/favicon-32.png', false],
  // No iPhone o sistema arredonda os cantos (e pinta de preto o que for transparente): fundo cheio.
  [180, 'apps/web/public/apple-touch-icon.png', true],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${(square ? svg.replace('rx="16"', 'rx="0"') : svg).replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body></html>`);
  await page.locator('div').screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log(out);
}
await browser.close();
