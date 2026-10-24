import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createSplit, guest, joinAs, openCreated } from './helpers.ts';

// Fase 8: finalizar/reabrir, home com finalizados, desktop igual ao celular e checagem axe nas telas do produto.
const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });

/** Lucas cria o split com Beatriz e Catarina, lança Pizza R$ 90,00 e Beatriz entra. */
async function setup(browser: Parameters<typeof guest>[0]) {
  const lucas = await guest(browser);
  const code = await createSplit(lucas, ['Beatriz', 'Catarina']);
  await openCreated(lucas);
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await lucas.locator('#ad-desc').fill('Pizza');
  await lucas.locator('#ad-amt').fill('90');
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(toast(lucas)).toContainText('Despesa adicionada');
  return { lucas, code };
}

async function openFinalize(page: Page) {
  await page.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('menuitem', { name: 'Finalizar split' }).click();
}

async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(' | ')}`);
}

test('finalizar: resumo com o que ficou pendente, só leitura, home em Finalizados; reabrir volta', async ({ browser }) => {
  const { lucas, code } = await setup(browser);
  await openFinalize(lucas);
  const sheet = lucas.getByRole('dialog', { name: 'Finalizar “Churras de sábado”?' });
  await expect(sheet).toContainText('Ficou pendente');
  await expect(sheet).toContainText('Beatriz → Você');
  await expect(sheet).toContainText('Catarina → Você');
  await expect(sheet).toContainText('Os comprovantes deste split são apagados ao finalizar.');
  await shot(lucas, 'finalizar');
  await sheet.getByRole('button', { name: 'Finalizar mesmo assim' }).click();
  await expect(toast(lucas)).toContainText('Split finalizado');
  await expect(lucas.locator('.banner-done')).toContainText(/Finalizado em \d+ \w+/);
  // Só leitura: ninguém lança nem marca pagamentos.
  await expect(lucas.getByRole('button', { name: 'Recebi' })).toHaveCount(0);
  await expect(lucas.getByRole('link', { name: 'Adicionar despesa' })).toHaveCount(0);
  await shot(lucas, 'finalizado');

  // Membro vê o aviso sem Reabrir, e o "Finalizar" do menu desabilitado não existe mais (vira Reabrir, desabilitado).
  const bia = await joinAs(browser, code, 'Beatriz');
  await expect(bia.locator('.banner-done')).toBeVisible();
  await expect(bia.locator('.banner-done').getByRole('button', { name: 'Reabrir' })).toHaveCount(0);
  await bia.getByRole('button', { name: 'Mais opções' }).click();
  await expect(bia.getByRole('menuitem', { name: /Reabrir/ })).toBeDisabled();

  // Home: o split sai de "Em andamento" e do total.
  await lucas.goto('./#/');
  await expect(lucas.locator('.overall')).toContainText('tudo quitado');
  await lucas.getByRole('button', { name: /Finalizados 1/ }).click();
  await expect(lucas.locator('.home-card')).toContainText(/Finalizado em/);
  await lucas.goBack();
  await lucas.locator('.banner-done').getByRole('button', { name: 'Reabrir' }).click();
  await expect(toast(lucas)).toContainText('Split reaberto');
  await expect(lucas.locator('.banner-done')).toHaveCount(0);
});

test('membro: "Finalizar split" aparece desabilitado no menu', async ({ browser }) => {
  const { code } = await setup(browser);
  const bia = await joinAs(browser, code, 'Beatriz');
  await bia.getByRole('button', { name: 'Mais opções' }).click();
  const item = bia.getByRole('menuitem', { name: /Finalizar split/ });
  await expect(item).toBeDisabled();
  await expect(item).toContainText('só admin');
  await expect(bia.getByRole('button', { name: 'Finalizar', exact: true })).toHaveCount(0);
});

test('desktop igual ao celular: coluna única, abas embaixo, sem rolagem horizontal', async ({ browser }) => {
  const { lucas } = await setup(browser);
  await expect(lucas.locator('.tabbar')).toBeVisible();
  const width = await lucas.locator('main.page').evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(560);
  await shot(lucas, 'split');
  const overflow = await lucas.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`acessibilidade (axe) nas telas do produto · ${theme}`, async ({ browser }) => {
    const { lucas } = await setup(browser);
    await lucas.evaluate((t) => localStorage.setItem('qpq.theme', t), theme);
    await lucas.reload();
    await expect(lucas.locator('html')).toHaveClass(`theme-${theme}`);
    const url = lucas.url().replace(/#.*$/, '');
    const split = lucas.url().match(/#\/s\/([^/]+)/)![1];
    for (const path of ['#/', `#/s/${split}`, `#/s/${split}/eu`, `#/s/${split}/pessoas`, '#/notificacoes', '#/conta']) {
      await lucas.goto(url + path);
      await expect(lucas.locator('main').first()).toBeVisible();
      await lucas.waitForTimeout(400);
      expect(await serious(lucas), path).toEqual([]);
    }
  });
}
