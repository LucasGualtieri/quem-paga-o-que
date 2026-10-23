import { expect, type Browser, type Page } from '@playwright/test';

// Cada contexto do navegador é um convidado diferente (login anônimo nos emuladores).
export async function guest(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('./#/');
  // Conta é opcional: a tela de entrada oferece "Continuar sem conta" (spec 03).
  await page.getByRole('button', { name: 'Continuar sem conta' }).click();
  await expect(page.getByRole('heading', { name: 'Meus splits' })).toBeVisible();
  return page;
}

export async function createSplit(page: Page, people: string[]): Promise<string> {
  await page.getByRole('link', { name: 'Novo split' }).click();
  await page.getByLabel('Nome do split *').fill('Churras de sábado');
  await page.getByLabel('Seu nome').fill('Lucas');
  for (const p of people) {
    await page.getByRole('textbox', { name: 'Nome do amigo' }).fill(p);
    await page.getByRole('button', { name: 'Adicionar' }).click();
  }
  await page.getByRole('button', { name: 'Criar split' }).click();
  await expect(page.getByRole('heading', { name: '“Churras de sábado” está pronto!' })).toBeVisible();
  const codeText = page.locator('.code-row .amt');
  await expect(codeText).toHaveText(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  return (await codeText.textContent())!;
}

