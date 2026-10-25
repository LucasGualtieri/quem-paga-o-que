import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SplitDoc } from './model.ts';
import { pruneSplitEdits, resetSplitEdits, startSplitEdit, useSplitEdits, withSplitEdits } from './splitEdits.ts';

afterEach(resetSplitEdits);

const split: SplitDoc = { id: 's1', name: 'Ano Novo', emoji: '🎆', status: 'open', code: 'K7M-24Q', createdBy: 'm1', members: {}, uids: [], adminUids: [], photo: 'covers/s1/a.jpg' };
const current = () => renderHook(() => useSplitEdits()).result.current;

describe('edições otimistas do split', () => {
  it('nome, capa e status valem na hora; saem quando o servidor alcança', () => {
    startSplitEdit('s1', { name: 'Réveillon', icon: { kind: 'icon', name: 'beach' }, clearPhoto: true });
    const done = new Date(5);
    startSplitEdit('s1', { status: 'done', doneAt: done });
    expect(withSplitEdits(split, current())).toMatchObject({ name: 'Réveillon', icon: { kind: 'icon', name: 'beach' }, photo: null, status: 'done', doneAt: done });
    // Outro split não muda.
    expect(withSplitEdits({ ...split, id: 's2' }, current())).toEqual({ ...split, id: 's2' });
    pruneSplitEdits([split]);
    expect(current()).toHaveLength(2);
    pruneSplitEdits([{ ...split, name: 'Réveillon', icon: { kind: 'icon', name: 'beach' }, photo: null }]);
    expect(current()).toHaveLength(1);
    pruneSplitEdits([{ ...split, status: 'done' }]);
    expect(current()).toHaveLength(0);
  });

  it('desfazer some na hora; resposta do servidor tira no próximo snapshot; snapshot de outro split não mexe', () => {
    const a = startSplitEdit('s1', { name: 'X' });
    a.undo();
    expect(current()).toHaveLength(0);
    const b = startSplitEdit('s1', { name: 'Y' });
    b.settle();
    pruneSplitEdits([split]);
    expect(current()).toHaveLength(0);
    startSplitEdit('s9', { icon: null });
    pruneSplitEdits([split]);
    expect(current()).toHaveLength(1);
  });
});
