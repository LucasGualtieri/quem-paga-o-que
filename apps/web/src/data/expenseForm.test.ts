import { describe, expect, it } from 'vitest';
import {
  analyze,
  defaultWeights,
  fromDoc,
  initialForm,
  newItem,
  setMode,
  toInput,
  toggleMember,
  type FormState,
} from './expenseForm.ts';
import type { ExpenseDoc, Member } from './model.ts';

const member = (id: string, name: string, joinOrder: number): Member => ({ id, name, nameKey: name.toLowerCase(), uid: null, admin: false, joinOrder, isNew: false });
const people = [member('lu', 'Lucas', 0), member('bi', 'Beatriz', 1), member('ca', 'Catarina', 2), member('fe', 'Fellipe', 3)];
const order = Object.fromEntries(people.map((p) => [p.id, p.joinOrder]));

const base = (extra: Partial<FormState> = {}): FormState => ({ ...initialForm(people, 'lu', '2026-12-28'), name: 'Pizza', amountStr: '80', ...extra });

describe('initialForm', () => {
  it('você paga, todos vêm marcados, igualmente e tag vazia', () => {
    const f = initialForm(people, 'lu', '2026-12-28');
    expect(f).toMatchObject({ payer: 'lu', members: ['lu', 'bi', 'ca', 'fe'], mode: 'equal', date: '2026-12-28', tags: [], name: '', amountStr: '' });
  });
});

describe('defaultWeights', () => {
  it('frações: 1 para cada um', () => {
    expect(defaultWeights('frac', ['lu', 'bi'], 0, 'pt-BR')).toEqual({ lu: '1', bi: '1' });
  });

  it('porcentagem: já preenchida igualmente e soma 100', () => {
    const w = defaultWeights('pct', ['lu', 'bi', 'ca'], 0, 'pt-BR');
    expect(w).toEqual({ lu: '33,34', bi: '33,33', ca: '33,33' });
    expect(defaultWeights('pct', ['lu', 'bi'], 0, 'en')).toEqual({ lu: '50.00', bi: '50.00' });
  });

  it('valor exato: a parte igual de cada um, centavos pela ordem de entrada', () => {
    expect(defaultWeights('exact', ['lu', 'bi', 'ca'], 1000, 'pt-BR')).toEqual({ lu: '3,34', bi: '3,33', ca: '3,33' });
  });
});

describe('analyze · igualmente', () => {
  it('divide e some os centavos pela ordem de entrada', () => {
    const a = analyze(base({ amountStr: '10', members: ['ca', 'bi', 'lu'] }), order);
    expect(a.ok).toBe(true);
    expect(a.shares).toEqual({ lu: 334, bi: 333, ca: 333 });
    expect(a.total).toBe(1000);
  });

  it('descrição vazia e valor zero ou inválido não deixam salvar', () => {
    expect(analyze(base({ name: '  ' }), order).nameError).toBe(true);
    expect(analyze(base({ amountStr: '' }), order).amountError).toBe(true);
    expect(analyze(base({ amountStr: '0' }), order).amountError).toBe(true);
    expect(analyze(base({ amountStr: 'abc' }), order).amountError).toBe(true);
    expect(analyze(base({ name: '  ' }), order).ok).toBe(false);
  });

  it('ninguém selecionado', () => {
    const a = analyze(base({ members: [] }), order);
    expect(a.splitError).toBe('no-members');
    expect(a.ok).toBe(false);
  });
});

describe('analyze · frações, % e valor exato', () => {
  it('pizza de 8 pedaços: 2, 1, 3, 2', () => {
    const f = base({ mode: 'frac', w: { lu: '2', bi: '1', ca: '3', fe: '2' } });
    expect(analyze(f, order).shares).toEqual({ lu: 2000, bi: 1000, ca: 3000, fe: 2000 });
  });

  it('frações com todos os pesos zero não salva', () => {
    expect(analyze(base({ mode: 'frac', w: { lu: '0', bi: '0', ca: '0', fe: '0' } }), order).splitError).toBe('weights-zero');
  });

  it('porcentagem que não soma 100 mostra quanto falta ou passa', () => {
    const f = base({ mode: 'pct', w: { lu: '50', bi: '30', ca: '10', fe: '0' } });
    const a = analyze(f, order);
    expect(a.splitError).toBe('pct-not-100');
    expect(a.pctSum).toBe(90);
    expect(a.ok).toBe(false);
  });

  it('porcentagem aceita vírgula e fecha em 100', () => {
    const f = base({ amountStr: '10', members: ['lu', 'bi', 'ca'], mode: 'pct', w: { lu: '33,33', bi: '33,33', ca: '33,34' } });
    const a = analyze(f, order);
    expect(a.ok).toBe(true);
    expect(a.shares).toEqual({ lu: 333, bi: 333, ca: 334 });
  });

  it('valor exato: soma diferente do total não salva e informa a diferença', () => {
    const f = base({ mode: 'exact', members: ['lu', 'bi'], w: { lu: '50', bi: '20' } });
    const a = analyze(f, order);
    expect(a.splitError).toBe('exact-mismatch');
    expect(a.exactSum).toBe(7000);
    expect(analyze({ ...f, w: { lu: '50', bi: '30' } }, order).ok).toBe(true);
  });
});

describe('analyze · por itens', () => {
  const items = (): FormState => ({
    ...base({ mode: 'items', amountStr: '100', members: [] }),
    items: [
      { ...newItem('a', ['lu', 'bi']), name: 'Cerveja', amountStr: '30' },
      { ...newItem('b', ['lu', 'bi', 'ca']), name: 'Carne', amountStr: '40', mode: 'frac', w: { lu: '2', bi: '1', ca: '1' } },
    ],
    rest: ['lu', 'bi', 'ca'],
  });

  it('itens + resto da compra (a diferença para o total) entre quem foi escolhido', () => {
    const a = analyze(items(), order);
    expect(a.ok).toBe(true);
    expect(a.rest).toBe(3000);
    // lu: 15 + 20 + 10, bi: 15 + 10 + 10, ca: 10 + 10
    expect(a.shares).toEqual({ lu: 4500, bi: 3500, ca: 2000 });
  });

  it('valor vazio: o total passa a ser a soma dos itens', () => {
    const f = { ...items(), amountStr: '', rest: [] };
    const a = analyze(f, order);
    expect(a.ok).toBe(true);
    expect(a.total).toBe(7000);
    expect(a.rest).toBe(0);
  });

  it('itens somando mais que o total', () => {
    const a = analyze({ ...items(), amountStr: '50' }, order);
    expect(a.splitError).toBe('items-exceed-total');
  });

  it('resto sem ninguém para pagar', () => {
    const a = analyze({ ...items(), rest: [] }, order);
    expect(a.ok).toBe(false);
    expect(a.itemErrors.rest).toBe('no-members');
  });

  it('item sem valor, sem pessoas ou com divisão que não fecha vira erro daquele item', () => {
    const f = items();
    f.items[0] = { ...f.items[0]!, amountStr: '', members: [] };
    f.items[1] = { ...f.items[1]!, mode: 'pct', w: { lu: '50', bi: '40', ca: '0' } };
    const a = analyze(f, order);
    expect(a.ok).toBe(false);
    expect(a.itemErrors[0]).toBe('amount-invalid');
    expect(a.itemErrors[1]).toBe('pct-not-100');
  });

  it('sem itens não salva', () => {
    const a = analyze({ ...items(), items: [] }, order);
    expect(a.splitError).toBe('no-items');
  });
});

describe('toInput (o que vai para a Function)', () => {
  it('igualmente', () => {
    expect(toInput(base({ note: ' ok ', tags: ['food'] }))).toEqual({
      name: 'Pizza',
      amount: 8000,
      payer: 'lu',
      members: ['lu', 'bi', 'ca', 'fe'],
      mode: 'equal',
      date: '2026-12-28',
      tags: ['food'],
      note: 'ok',
      longDesc: '',
      icon: null,
    });
  });

  it('frações/%/exato levam só os pesos de quem está na divisão, em números', () => {
    const f = base({ mode: 'pct', members: ['lu', 'bi'], w: { lu: '33,5', bi: '66,5', ca: '99' } });
    expect(toInput(f).w).toEqual({ lu: 33.5, bi: 66.5 });
    const e = base({ mode: 'exact', members: ['lu', 'bi'], w: { lu: '50,25', bi: '29,75' } });
    expect(toInput(e).w).toEqual({ lu: 5025, bi: 2975 });
  });

  it('itens: valor vazio vira null e os pesos viram números', () => {
    const f: FormState = {
      ...base({ mode: 'items', amountStr: '' }),
      items: [{ ...newItem('a', ['lu']), name: 'X', amountStr: '12,5', mode: 'frac', w: { lu: '2' } }],
      rest: ['lu'],
      restMode: 'equal',
    };
    const i = toInput(f);
    expect(i.amount).toBeNull();
    expect(i.items).toEqual([{ name: 'X', amount: 1250, members: ['lu'], mode: 'frac', w: { lu: 2 } }]);
    expect(i.rest).toEqual(['lu']);
    expect(i.restMode).toBe('equal');
  });
});

describe('fromDoc (editar)', () => {
  const doc: ExpenseDoc = {
    id: 'e1',
    name: 'Pizza',
    amount: 8000,
    payer: 'bi',
    members: ['lu', 'bi'],
    mode: 'frac',
    w: { lu: 2, bi: 1 },
    date: '2026-12-20',
    tags: ['food'],
    note: 'n',
    longDesc: 'l',
    author: 'bi',
    version: 3,
    updatedBy: 'bi',
    deletedAt: null,
    paid: {},
    pendConf: {},
    proof: {},
    receipt: null,
    paySeq: 0,
  };

  it('volta ao estado do formulário no idioma da tela', () => {
    const f = fromDoc(doc, 'pt-BR');
    expect(f).toMatchObject({ name: 'Pizza', amountStr: '80,00', payer: 'bi', members: ['lu', 'bi'], mode: 'frac', w: { lu: '2', bi: '1' }, date: '2026-12-20', tags: ['food'], note: 'n', longDesc: 'l' });
    expect(toInput(f)).toMatchObject({ amount: 8000, w: { lu: 2, bi: 1 } });
  });

  it('itens e resto voltam editáveis', () => {
    const f = fromDoc(
      { ...doc, mode: 'items', members: ['lu'], items: [{ name: 'Cerveja', amount: 3000, members: ['lu', 'bi'], mode: 'pct', w: { lu: 50, bi: 50 } }], rest: ['lu'], restMode: 'exact', restW: { lu: 2000 } },
      'pt-BR',
    );
    expect(f.items).toHaveLength(1);
    expect(f.items[0]).toMatchObject({ name: 'Cerveja', amountStr: '30,00', mode: 'pct', w: { lu: '50', bi: '50' }, min: true });
    expect(f).toMatchObject({ rest: ['lu'], restMode: 'exact', restW: { lu: '20,00' } });
  });
});

describe('toggleMember e setMode', () => {
  it('desmarcar e marcar mantém a ordem de entrada', () => {
    const f = toggleMember(base(), 'bi', people);
    expect(f.members).toEqual(['lu', 'ca', 'fe']);
    expect(toggleMember(f, 'bi', people).members).toEqual(['lu', 'bi', 'ca', 'fe']);
  });

  it('trocar de modo preenche os pesos padrão de quem está selecionado', () => {
    const f = setMode(base({ amountStr: '10', members: ['lu', 'bi', 'ca'] }), 'exact', 'pt-BR');
    expect(f.mode).toBe('exact');
    expect(f.w).toEqual({ lu: '3,34', bi: '3,33', ca: '3,33' });
    expect(setMode(f, 'frac', 'pt-BR').w).toEqual({ lu: '1', bi: '1', ca: '1' });
  });

  it('entrar em itens cria o primeiro item com todo mundo', () => {
    const f = setMode(base(), 'items', 'pt-BR');
    expect(f.items).toHaveLength(1);
    expect(f.items[0]?.members).toEqual(['lu', 'bi', 'ca', 'fe']);
    expect(f.rest).toEqual(['lu', 'bi', 'ca', 'fe']);
  });
});
