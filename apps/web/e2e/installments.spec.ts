import { expect, test, type Page } from '@playwright/test';
import { createSplit, guest, openCreated } from './helpers.ts';

// Despesa parcelada (spec 05): contam as vencidas e a próxima; antecipar faz contar antes.
const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
/** Dia (AAAA-MM-DD, Brasília) a `n` dias de hoje. */
const ymd = (n: number) => new Date(Date.now() - 3 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

test('lança parcelada, vencidas e a próxima entram no saldo e antecipar conta o resto', async ({ browser }) => {
  const lucas = await guest(browser);
  await createSplit(lucas, ['Beatriz', 'Catarina']);
  await openCreated(lucas);
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await lucas.locator('#ad-desc').fill('Airbnb');
  await lucas.locator('#ad-amt').fill('900,00');
  await lucas.getByRole('switch', { name: 'Parcelado' }).click();
  await lucas.getByRole('button', { name: 'Mais uma parte' }).last().click();
  await lucas.locator('#ad-first').fill(ymd(-20));
  await expect(lucas.locator('.plan-sum')).toContainText('3x de R$ 300,00');
  await shot(lucas, 'form-parcelado');
  await lucas.locator('.bottombar [type=submit]').click();
  await expect(toast(lucas)).toContainText('Despesa adicionada');

  await expect(lucas.locator('.plan-cap')).toContainText('3x · parcela 2 vence');
  await shot(lucas, 'lista-parcelada');

  // Meu saldo: cada um deve a 1ª (vencida) e a 2ª (próxima), R$ 200,00; a 3ª aparece como futura.
  await lucas.getByRole('link', { name: 'Meu saldo' }).click();
  await expect(lucas.locator('.bigbal')).toContainText('+R$ 400,00');
  await expect(lucas.locator('.bigbal')).toContainText('parcelas futuras: +R$ 200,00');

  await lucas.getByRole('link', { name: 'Despesas' }).click();
  await lucas.locator('.txrow', { hasText: 'Airbnb' }).click();
  const plan = lucas.locator('section', { has: lucas.getByRole('heading', { name: 'Parcelas' }) });
  await expect(plan.locator('.plan-line')).toHaveCount(3);
  await expect(plan.locator('.plan-line').nth(1)).toContainText('Próxima');
  await expect(plan).toContainText('2 de 3 no saldo');
  await plan.getByRole('button', { name: /Antecipar a próxima/ }).first().click();
  await expect(toast(lucas)).toContainText('Parcela antecipada');
  await expect(plan.locator('.plan-people .row2').first()).toContainText('Todas as parcelas já estão no saldo');
  await shot(lucas, 'detalhe-parcelada');
});
