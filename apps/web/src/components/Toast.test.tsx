import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast.tsx';

function Trigger({ onUndo }: { onUndo?: () => void }) {
  const toast = useToast();
  return (
    <button onClick={() => toast.show(onUndo ? { text: 'Despesa adicionada', onUndo } : { text: 'Despesa adicionada' })}>
      mostrar
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('aparece como status e some sozinho em cerca de 4 s', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText('mostrar'));
    expect(screen.getByRole('status')).toHaveTextContent('Despesa adicionada');
    act(() => vi.advanceTimersByTime(4100));
    expect(screen.queryByText('Despesa adicionada')).toBeNull();
  });

  it('Desfazer chama a ação inversa e fecha o toast', async () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText('mostrar'));
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Despesa adicionada')).toBeNull();
  });

  it('sem ação reversível, não mostra Desfazer', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText('mostrar'));
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });
});
