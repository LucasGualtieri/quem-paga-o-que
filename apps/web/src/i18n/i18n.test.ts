import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import i18n, { detectLang, setLang, useLang } from './index.ts';
import ptBR from './pt-BR.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function values(obj: object): unknown[] {
  return Object.values(obj).flatMap((v) => (v && typeof v === 'object' ? values(v as object) : [v]));
}

describe('i18n', () => {
  it('EN tem exatamente as mesmas chaves que PT-BR', () => {
    expect(keys(en).sort()).toEqual(keys(ptBR).sort());
  });

  it('nenhum texto vazio', () => {
    for (const v of [...values(en), ...values(ptBR)]) expect(typeof v === 'string' && v.trim().length > 0).toBe(true);
  });

  it('primeira visita: qualquer português abre em PT-BR; o resto, em EN', () => {
    expect(detectLang(['pt-BR', 'en'])).toBe('pt-BR');
    expect(detectLang(['pt-PT'])).toBe('pt-BR');
    expect(detectLang(['pt'])).toBe('pt-BR');
    expect(detectLang(['en-US', 'pt-BR'])).toBe('en');
    expect(detectLang(['es-AR'])).toBe('en');
    expect(detectLang([])).toBe('pt-BR');
  });

  it('PT-BR é o padrão', () => {
    expect(i18n.language).toBe('pt-BR');
    expect(i18n.t('common.undo')).toBe('Desfazer');
  });

  it('trocar idioma muda os textos, o lang do documento e fica salvo', async () => {
    const { result } = renderHook(() => useLang());
    await act(() => setLang('en'));
    expect(result.current).toBe('en');
    expect(i18n.t('common.undo')).toBe('Undo');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('qpq.lang')).toBe('en');
    await act(() => setLang('pt-BR'));
    expect(document.documentElement.lang).toBe('pt-BR');
  });
});
