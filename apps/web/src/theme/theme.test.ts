import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setTheme, useTheme } from './theme.ts';

describe('tema', () => {
  it('claro é o padrão', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current).toBe('light');
  });

  it('trocar tema muda a classe do documento e fica salvo', () => {
    const { result } = renderHook(() => useTheme());
    act(() => setTheme('dark'));
    expect(result.current).toBe('dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
    expect(localStorage.getItem('qpq.theme')).toBe('dark');
    act(() => setTheme('light'));
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });
});
