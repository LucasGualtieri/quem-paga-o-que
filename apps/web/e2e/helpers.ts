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


/** Outro convidado entra no split pelo código escolhendo o próprio nome (e abre o split). */
export async function joinAs(browser: Browser, code: string, name: string): Promise<Page> {
  const page = await guest(browser);
  await page.goto(`./#/convite/${code}`);
  await page.getByRole('radio', { name: new RegExp(name) }).check();
  await page.getByRole('button', { name: `Entrar como ${name}` }).click();
  // Com vários testes em paralelo, o emulador de Functions demora mais para responder.
  await expect(page.locator('.toast-region')).toContainText('Você entrou', { timeout: 15_000 });
  return page;
}

/** Abre o split recém-criado (o do Lucas, na tela "está pronto"). */
export async function openCreated(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Ir para o split' }).click();
  await expect(page.getByRole('heading', { name: 'Churras de sábado' })).toBeVisible();
}

/** Admin troca o modo de pagamento nas Configurações do split e volta ao split (spec 06). */
export async function setPayMode(page: Page, mode: 'Simplificado' | 'Detalhado'): Promise<void> {
  await page.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('menuitem', { name: 'Configurações do split' }).click();
  await page.getByRole('radio', { name: new RegExp(`^${mode}`) }).check();
  await expect(page.locator('.toast-region')).toContainText(`Pagamentos: ${mode}`, { timeout: 15_000 });
  await page.getByRole('link', { name: 'Voltar' }).click();
}
