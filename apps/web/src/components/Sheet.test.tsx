import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet.tsx';

describe('Sheet', () => {
  it('é um diálogo modal com título', () => {
    render(
      <Sheet open title="Anexar comprovante" onClose={() => {}}>
        conteúdo
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Anexar comprovante' })).toHaveAttribute('aria-modal', 'true');
  });

  it('fecha com Esc, no fundo escurecido e no X', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Anexar comprovante" onClose={onClose}>
        conteúdo
      </Sheet>,
    );
    await userEvent.keyboard('{Escape}');
    const closers = screen.getAllByRole('button', { name: 'Fechar' });
    for (const b of closers) await userEvent.click(b);
    expect(onClose).toHaveBeenCalledTimes(1 + closers.length);
    expect(closers.length).toBe(2);
  });

  it('fechada não renderiza nada', () => {
    render(
      <Sheet open={false} title="Anexar comprovante" onClose={() => {}}>
        conteúdo
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
