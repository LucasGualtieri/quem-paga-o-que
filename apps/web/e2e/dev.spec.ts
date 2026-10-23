import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// O build minificado escreve hex em minúsculas; compara em maiúsculas.
const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toUpperCase(), name);

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
});

test('Folha de estilo nos dois temas: screenshot em 390 e 1440 px', async ({ page }, info) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => localStorage.setItem('qpq.theme', t), theme);
    await page.goto('./#/dev/estilo');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Folha de estilo' })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(`theme-${theme}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`estilo-${theme}.png`), fullPage: true });
  }
});

test('sem rolagem horizontal', async ({ page }) => {
  for (const path of ['./#/dev', './#/dev/estilo', './#/dev/paleta']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('tema: troca na hora, muda os tokens e fica salvo', async ({ page }) => {
  await page.goto('./#/dev/estilo');
  expect(await cssVar(page, '--bg')).toBe('#F3F3F0');
  await page.getByRole('button', { name: /Trocar para o tema escuro/ }).click();
  await expect(page.locator('html')).toHaveClass(/theme-dark/);
  expect(await cssVar(page, '--bg')).toBe('#111114');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/theme-dark/);
});

test('idioma: EN completo e salvo', async ({ page }) => {
  await page.goto('./#/dev/estilo');
  await page.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'EN' }).click();
  await expect(page.getByRole('heading', { name: 'Style sheet' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('R$ 1,200.00').or(page.getByText('+R$ 120.00')).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Style sheet' })).toBeVisible();
});

test('paleta: mudar um token muda o app inteiro; Restaurar volta', async ({ page }) => {
  await page.goto('./#/dev/paleta');
  const field = page.getByRole('textbox', { name: 'Valor de --accent', exact: true });
  await field.fill('#0E7C66');
  expect(await cssVar(page, '--accent')).toBe('#0E7C66');

  await page.goto('./#/dev/estilo');
  expect(await cssVar(page, '--accent')).toBe('#0E7C66');
  const bg = await page.getByRole('button', { name: 'Novo split' }).first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(14, 124, 102)');

  await page.goto('./#/dev/paleta');
  await page.getByRole('button', { name: 'Restaurar' }).click();
  expect(await cssVar(page, '--accent')).toBe('#5534E0');
});

test('UX otimista: muda na hora e volta se o servidor recusar', async ({ page }) => {
  await page.goto('./#/dev/estilo');
  const sw = page.getByRole('switch', { name: 'Interruptor que o servidor recusa' });
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(sw).toHaveAttribute('aria-checked', 'false', { timeout: 3000 });
  await expect(page.getByRole('status')).toContainText('Não deu para salvar');

  const ok = page.getByRole('switch', { name: 'Interruptor que salva' });
  await ok.click();
  await expect(ok).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(900);
  await expect(ok).toHaveAttribute('aria-checked', 'true');
});

test('folha: abre, fecha com Esc e devolve o foco', async ({ page }) => {
  await page.goto('./#/dev/estilo');
  const open = page.getByRole('button', { name: 'Abrir folha' });
  await open.click();
  await expect(page.getByRole('dialog', { name: 'Anexar comprovante' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(open).toBeFocused();
});

for (const theme of ['light', 'dark'] as const) {
  test(`acessibilidade (axe) sem violações sérias · ${theme}`, async ({ page }) => {
    await page.evaluate((t) => localStorage.setItem('qpq.theme', t), theme);
    await page.goto('./#/dev/estilo');
    await page.reload();
    await expect(page.locator('html')).toHaveClass(`theme-${theme}`);
    await expect(page.getByRole('heading', { name: 'Folha de estilo' })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(' | ')}`)).toEqual([]);
  });
}
