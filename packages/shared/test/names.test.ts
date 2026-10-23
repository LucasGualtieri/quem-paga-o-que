import { describe, expect, it } from 'vitest';
import { cleanName, findDuplicate, isValidName, nameKey, NAME_MAX } from '../src/index.ts';

describe('nameKey (decisão 3: um nome, uma pessoa)', () => {
  it('ignora maiúsculas, acentos e espaços extras', () => {
    expect(nameKey('Lucas')).toBe(nameKey('lúcas '));
    expect(nameKey('LUCAS')).toBe(nameKey('  lucas'));
    expect(nameKey('Ana  Maria')).toBe(nameKey('ana maria'));
    expect(nameKey('João')).toBe('joao');
  });

  it('nomes diferentes continuam diferentes', () => {
    expect(nameKey('Lucas')).not.toBe(nameKey('Lucas G.'));
    expect(nameKey('Bia')).not.toBe(nameKey('Beatriz'));
  });
});

describe('cleanName e isValidName', () => {
  it('tira espaços das pontas e repetidos', () => {
    expect(cleanName('  Ana   Maria ')).toBe('Ana Maria');
  });

  it('nome vazio ou longo demais não vale', () => {
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('a'.repeat(NAME_MAX + 1))).toBe(false);
    expect(isValidName('Bia')).toBe(true);
  });
});

describe('findDuplicate', () => {
  it('acha o primeiro nome repetido de uma lista', () => {
    expect(findDuplicate(['Lucas', 'Bia', 'lúcas'])).toBe('lúcas');
    expect(findDuplicate(['Lucas', 'Bia'])).toBeNull();
  });
});
