import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/tokens.css';
import './theme/base.css';
import './i18n/index.ts';
import { App } from './App.tsx';
import { ToastProvider } from './components/index.ts';
import { applyTheme } from './theme/theme.ts';

applyTheme();

// Condição escrita aqui (e não importada) para o bundler cortar estes chunks quando desligada.
if (import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true') {
  await import('./dev/dev.css');
  const { initOverrides } = await import('./dev/overrides.ts');
  initOverrides();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
