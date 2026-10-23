import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast.tsx';
import { useOptimisticAction, useOptimisticValue } from './optimistic.ts';

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useOptimisticValue', () => {
  it('muda na hora, antes do servidor responder', () => {
    const d = deferred();
    const { result } = renderHook(() => useOptimisticValue(false, () => d.promise), { wrapper });
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });

  it('servidor confirmou: continua no novo valor', async () => {
    const d = deferred();
    const { result } = renderHook(() => useOptimisticValue(false, () => d.promise), { wrapper });
    act(() => result.current[1](true));
    await act(async () => d.resolve());
    expect(result.current[0]).toBe(true);
  });

  it('servidor recusou: volta ao valor anterior e mostra toast de erro', async () => {
    const d = deferred();
    const { result } = renderHook(() => useOptimisticValue(false, () => d.promise), { wrapper });
    act(() => result.current[1](true));
    await act(async () => d.reject(new Error('permission-denied')));
    expect(result.current[0]).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Não deu para salvar');
  });

  it('quando o valor do servidor muda, ele vence', () => {
    const { result, rerender } = renderHook(({ server }) => useOptimisticValue(server, () => Promise.resolve()), {
      wrapper,
      initialProps: { server: false },
    });
    rerender({ server: true });
    expect(result.current[0]).toBe(true);
  });

  it('só a última mudança decide quando há várias seguidas', async () => {
    const first = deferred();
    const second = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useOptimisticValue<number>(0, save), { wrapper });
    act(() => result.current[1](1));
    act(() => result.current[1](2));
    await act(async () => first.reject(new Error('x')));
    expect(result.current[0]).toBe(2);
    await act(async () => second.resolve());
    expect(result.current[0]).toBe(2);
  });
});

describe('useOptimisticAction', () => {
  it('aplica, confirma e não desfaz', async () => {
    const rollback = vi.fn();
    const { result } = renderHook(() => useOptimisticAction(), { wrapper });
    await act(() => result.current({ apply: () => rollback, commit: () => Promise.resolve() }));
    expect(rollback).not.toHaveBeenCalled();
  });

  it('servidor recusou: desfaz e avisa', async () => {
    const rollback = vi.fn();
    function Host() {
      const run = useOptimisticAction();
      return (
        <button onClick={() => void run({ apply: () => rollback, commit: () => Promise.reject(new Error('x')) })}>ir</button>
      );
    }
    render(
      <ToastProvider>
        <Host />
      </ToastProvider>,
    );
    act(() => screen.getByText('ir').click());
    await waitFor(() => expect(rollback).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('Não deu para salvar');
  });
});
