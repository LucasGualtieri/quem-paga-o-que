import { expect, test, type Locator, type Page } from '@playwright/test';
import { createSplit, guest, openCreated } from './helpers.ts';

// Ações rápidas na aba Despesas (29/10/2026): "⋯" no computador, deslizar no celular, duplicar e
// excluir em lote com Desfazer.
const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
const row = (page: Page, name: string) => page.locator('.swipe', { has: page.locator('.txrow .ttl', { hasText: new RegExp(`^${name}$`) }) });

async function addExpense(page: Page, name: string, amount: string) {
  await page.getByRole('link', { name: 'Adicionar despesa' }).or(page.getByRole('button', { name: 'Adicionar despesa' })).first().click();
  await page.locator('#ad-desc').fill(name);
  await page.locator('#ad-amt').fill(amount);
  await page.locator('.bottombar [type=submit]').click();
  await expect(toast(page)).toContainText('Despesa adicionada');
}

async function setup(browser: Parameters<typeof guest>[0]) {
  const lucas = await guest(browser);
  await createSplit(lucas, ['Beatriz']);
  await openCreated(lucas);
  await addExpense(lucas, 'Primeira parcela', '625,00');
  await addExpense(lucas, 'Segunda parcela', '625,00');
  return lucas;
}

/** Toque simulado (o Playwright só tem "tap"): desliza `dx` px ou segura sem mexer. */
async function touch(target: Locator, dx: number, holdMs = 0) {
  await target.evaluate(
    async (el, [dx, holdMs]) => {
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const x0 = r.right - 40;
      const ev = (type: string, x: number) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 5, bubbles: true, clientX: x, clientY: y, isPrimary: true }));
      ev('pointerdown', x0);
      if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
      for (let i = 1; i <= 10; i++) {
        await new Promise((r) => setTimeout(r, 16));
        ev('pointermove', x0 + (dx * i) / 10);
      }
      ev('pointerup', x0 + dx);
    },
    [dx, holdMs] as const,
  );
}

test('computador: "⋯" duplica (com Desfazer) e seleciona para excluir em lote', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'o "⋯" visível é do computador');
  const lucas = await setup(browser);
  await row(lucas, 'Primeira parcela').getByRole('button', { name: 'Ações de Primeira parcela' }).click();
  await lucas.getByRole('menuitem', { name: 'Duplicar' }).click();
  await expect(toast(lucas)).toContainText('Despesa duplicada');
  await expect(row(lucas, 'Primeira parcela \\(cópia\\)')).toBeVisible();
  await shot(lucas, 'duplicada');

  // Seleção: pelo "⋯" e depois tocando nas outras.
  await row(lucas, 'Segunda parcela').getByRole('button', { name: 'Ações de Segunda parcela' }).click();
  await lucas.getByRole('menuitem', { name: 'Selecionar' }).click();
  await lucas.getByRole('button', { name: 'Selecionar todas (3)' }).click();
  const bar = lucas.getByRole('region', { name: 'Despesas selecionadas' });
  await expect(bar).toContainText('3 selecionadas');
  await expect(bar).toContainText('R$ 1.875,00');
  await expect(lucas.locator('.fab')).toHaveCount(0);
  await shot(lucas, 'selecao');
  await bar.getByRole('button', { name: 'Excluir' }).click();
  const sheet = lucas.getByRole('dialog', { name: 'Excluir 3 despesas?' });
  await sheet.getByRole('button', { name: 'Excluir 3 despesas' }).click();
  await expect(toast(lucas)).toContainText('3 despesas excluídas');
  await expect(lucas.locator('.swipe')).toHaveCount(0);
  await toast(lucas).getByRole('button', { name: 'Desfazer' }).click();
  await expect(lucas.locator('.swipe')).toHaveCount(3);
});

test('celular: deslizar mostra Duplicar, Editar e Excluir; segurar entra na seleção', async ({ browser }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'gestos de toque');
  const lucas = await setup(browser);
  const first = row(lucas, 'Segunda parcela');
  await touch(first.locator('.txrow'), -200);
  await expect(first.locator('.swipe-act')).toHaveText(['Duplicar', 'Editar', 'Excluir']);
  await shot(lucas, 'deslizada');
  await first.getByRole('button', { name: 'Editar' }).click();
  await expect(lucas).toHaveURL(/\/despesa\/[^/]+\/editar$/);
  await lucas.goBack();

  await touch(row(lucas, 'Primeira parcela').locator('.txrow'), 0, 650);
  await expect(lucas.getByRole('region', { name: 'Despesas selecionadas' })).toContainText('1 selecionada');
  // Cabeçalho do dia marca o dia todo.
  await lucas.locator('.daysel').first().click();
  await expect(lucas.getByRole('region', { name: 'Despesas selecionadas' })).toContainText('2 selecionadas');
  // Com tudo marcado, o "Selecionar todas" some.
  await expect(lucas.getByRole('button', { name: /Selecionar todas/ })).toHaveCount(0);
  await lucas.getByRole('button', { name: 'Cancelar' }).click();
  await expect(lucas.getByRole('region', { name: 'Despesas selecionadas' })).toHaveCount(0);
});
