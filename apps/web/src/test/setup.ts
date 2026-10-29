import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import './lang.ts';
import '../i18n/index.ts';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
