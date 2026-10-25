import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import pt from '../i18n/pt-BR.json';
import { bellCount, viewOf, type NotificationDoc } from './notifications.ts';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: pt } }, interpolation: { escapeValue: false } });
const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o ?? {});
const names: Record<string, string> = { m1: 'Lucas', m2: 'Beatriz', m3: 'Catarina' };
const name = (id: string | null) => (id ? (names[id] ?? '') : '');
const money = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;

const base: NotificationDoc = {
  id: 'n1',
  to: 'u1',
  toMember: 'm1',
  kind: 'paid',
  splitId: 's1',
  splitName: 'Ano Novo',
  from: 'm2',
  fromName: 'Beatriz',
  amount: 4000,
  hasProof: true,
  expId: 'e1',
  expName: 'Pizza',
  memberId: 'm2',
  paymentId: null,
  payFrom: null,
  payTo: null,
  read: false,
  status: 'new',
  hidden: false,
  at: null,
};

describe('textos das notificações (spec 07)', () => {
  it('"Beatriz pagou R$ 40,00 pra você", com comprovante e estado; leva ao detalhe com destaque', () => {
    expect(viewOf(base, t, name, money)).toEqual({ title: 'Beatriz pagou R$ 40,00 pra você', sub: 'Pizza · Ano Novo · com comprovante', to: '/s/s1/despesa/e1?n=n1' });
    expect(viewOf({ ...base, hasProof: false, status: 'confirmed' }, t, name, money).sub).toBe('Pizza · Ano Novo · sem comprovante · confirmado');
    expect(viewOf({ ...base, status: 'disputed' }, t, name, money).sub).toBe('Pizza · Ano Novo · com comprovante · você contestou');
    // Nome atual vence o guardado; sem o participante, vale o guardado.
    expect(viewOf({ ...base, from: 'm9' }, t, name, money).title).toBe('Beatriz pagou R$ 40,00 pra você');
  });

  it('acerto: quem recebeu, quem pagou e admin de fora; leva ao Saldo', () => {
    const settled = { ...base, kind: 'settled' as const, expId: null, expName: null, memberId: null, paymentId: 'p1', payFrom: 'm2', payTo: 'm1' };
    expect(viewOf(settled, t, name, money)).toEqual({ title: 'Beatriz pagou R$ 40,00 pra você', sub: 'Acerto de contas · Ano Novo', to: '/s/s1/saldo' });
    expect(viewOf({ ...settled, from: 'm1', fromName: 'Lucas', toMember: 'm2' }, t, name, money).title).toBe('Lucas marcou que recebeu R$ 40,00 de você');
    expect(viewOf({ ...settled, from: 'm3', fromName: 'Catarina' }, t, name, money).title).toBe('Catarina registrou que Beatriz te pagou R$ 40,00');
    expect(viewOf({ ...settled, from: 'm3', fromName: 'Catarina', toMember: 'm2' }, t, name, money).title).toBe('Catarina registrou que você pagou R$ 40,00 para Lucas');
  });

  it('comprovante depois e "Não recebi"', () => {
    expect(viewOf({ ...base, kind: 'proof' }, t, name, money)).toMatchObject({ title: 'Beatriz enviou um comprovante', sub: 'Pizza · Ano Novo · R$ 40,00' });
    expect(viewOf({ ...base, kind: 'proof', expId: null, expName: null, paymentId: 'p1' }, t, name, money)).toMatchObject({ sub: 'Acerto de contas · Ano Novo · R$ 40,00', to: '/s/s1/saldo' });
    expect(viewOf({ ...base, kind: 'disputed', from: 'm1', fromName: 'Lucas' }, t, name, money)).toMatchObject({ title: 'Lucas avisou que não recebeu R$ 40,00', sub: 'Pizza · Ano Novo' });
  });

  it('split excluído: leva à explicação, mesmo sem o split na lista', () => {
    const del = { ...base, kind: 'splitDeleted' as const, from: 'm1', fromName: 'Lucas', amount: 0, expId: null, expName: null, memberId: null };
    expect(viewOf(del, t, () => '', money)).toEqual({ title: 'Lucas excluiu o split Ano Novo', sub: 'As despesas e os acertos foram apagados', to: '/s/s1' });
  });

  it('split finalizado sozinho: avisa todos e leva ao split', () => {
    const auto = { ...base, kind: 'autoFinalized' as const, from: '', fromName: '', amount: 0, expId: null, expName: null, memberId: null };
    expect(viewOf(auto, t, () => '', money)).toEqual({ title: 'Ano Novo foi finalizado: todos quitaram', sub: 'Um admin pode reabrir se precisar', to: '/s/s1' });
  });

  it('sino conta até "9+"', () => {
    expect(bellCount(3)).toBe('3');
    expect(bellCount(10)).toBe('9+');
  });
});
