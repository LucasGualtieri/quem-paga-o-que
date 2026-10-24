import { describe, expect, it } from 'vitest';
import { parseEntryIcon, resolveIcon } from '../src/index.ts';

describe('ícone ou emoji', () => {
  it('aceita ícone da coleção e emoji; o resto não', () => {
    expect(parseEntryIcon(undefined)).toBeNull();
    expect(parseEntryIcon(null)).toBeNull();
    expect(parseEntryIcon({ kind: 'icon', name: 'pizza' })).toEqual({ kind: 'icon', name: 'pizza' });
    expect(parseEntryIcon({ kind: 'emoji', value: '🍕' })).toEqual({ kind: 'emoji', value: '🍕' });
    expect(parseEntryIcon({ kind: 'emoji', value: '🇧🇷' })).toEqual({ kind: 'emoji', value: '🇧🇷' });
    expect(parseEntryIcon({ kind: 'emoji', value: '👨‍👩‍👧' })).toEqual({ kind: 'emoji', value: '👨‍👩‍👧' });
    for (const bad of ['🍕', 3, { kind: 'icon', name: 'trash' }, { kind: 'emoji', value: 'abc' }, { kind: 'emoji', value: '🍕 🍕' }, { kind: 'emoji', value: '🍕'.repeat(9) }, { kind: 'emoji', value: 7 }, { kind: 'x' }]) {
      expect(parseEntryIcon(bad)).toBe(false);
    }
  });

  it('automático: despesa pela primeira tag (sem tag, o recibo); item com o ícone padrão dele', () => {
    expect(resolveIcon(null, { tags: ['drinks', 'food'] })).toEqual({ kind: 'icon', name: 'drink' });
    expect(resolveIcon(undefined, { tags: ['other'] })).toEqual({ kind: 'icon', name: 'receipt' });
    expect(resolveIcon(null, { tags: [] })).toEqual({ kind: 'icon', name: 'receipt' });
    expect(resolveIcon(null, 'item')).toEqual({ kind: 'icon', name: 'box' });
    expect(resolveIcon({ kind: 'emoji', value: '🎉' }, 'item')).toEqual({ kind: 'emoji', value: '🎉' });
  });
});
