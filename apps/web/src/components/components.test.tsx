import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AvatarToggle, Badge, Button, Chip, PersonRow, Segmented, Stepper, Switch, TextField } from './index.ts';

describe('Switch', () => {
  it('é um role="switch" com aria-checked e alterna ao clicar', async () => {
    function Host() {
      const [on, setOn] = useState(false);
      return <Switch checked={on} onChange={setOn} label="Por e-mail" />;
    }
    render(<Host />);
    const sw = screen.getByRole('switch', { name: 'Por e-mail' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
});

describe('seleção sem checkbox (aria-pressed)', () => {
  it('Chip', async () => {
    const onClick = vi.fn();
    render(<Chip pressed onClick={onClick}>#Comida</Chip>);
    const chip = screen.getByRole('button', { name: '#Comida' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('PersonRow: selecionada tem aria-pressed e selo de check; sem checkbox', () => {
    render(
      <>
        <PersonRow name="Você" color={1} selected me trailing="R$ 30,00" onClick={() => {}} />
        <PersonRow name="Fellipe" color={4} selected={false} caption="Fora desta despesa" onClick={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: /Você/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Fellipe/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('AvatarToggle: seu nome em negrito embaixo do avatar', () => {
    render(
      <>
        <AvatarToggle name="Você" color={1} selected me onClick={() => {}} />
        <AvatarToggle name="Beatriz" color={2} selected onClick={() => {}} />
      </>,
    );
    expect(screen.getByText('Você')).toHaveClass('me');
    expect(screen.getByText('Beatriz')).not.toHaveClass('me');
    expect(screen.getByRole('button', { name: 'Você' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Segmented', () => {
  it('marca a opção atual e troca ao clicar', async () => {
    function Host() {
      const [v, setV] = useState('frac');
      return (
        <Segmented
          label="Como dividir"
          value={v}
          onChange={setV}
          options={[
            { value: 'equal', label: 'Igualmente' },
            { value: 'frac', label: 'Frações' },
          ]}
        />
      );
    }
    render(<Host />);
    expect(screen.getByRole('group', { name: 'Como dividir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Frações' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Igualmente' }));
    expect(screen.getByRole('button', { name: 'Igualmente' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Frações' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Stepper', () => {
  it('soma e subtrai respeitando o mínimo', async () => {
    function Host() {
      const [v, setV] = useState(1);
      return <Stepper value={v} min={0} onChange={setV} />;
    }
    render(<Host />);
    const less = screen.getByRole('button', { name: 'Menos uma parte' });
    const more = screen.getByRole('button', { name: 'Mais uma parte' });
    await userEvent.click(more);
    expect(screen.getByText('2')).toBeInTheDocument();
    await userEvent.click(less);
    await userEvent.click(less);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(less).toBeDisabled();
  });
});

describe('TextField', () => {
  it('erro fica ligado ao campo para leitores de tela', () => {
    render(<TextField label="Descrição" error="Dê um nome para a despesa" />);
    const input = screen.getByLabelText('Descrição');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Dê um nome para a despesa');
  });

  it('sem erro não é inválido', () => {
    render(<TextField label="Descrição" />);
    expect(screen.getByLabelText('Descrição')).not.toHaveAttribute('aria-invalid');
  });
});

describe('Button e Badge', () => {
  it('botão desabilitado não dispara', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Desabilitado
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Desabilitado' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('selo nunca é só cor: tem texto e ícone', () => {
    const { container } = render(
      <Badge tone="neg" icon="clock">
        Pendente
      </Badge>,
    );
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
