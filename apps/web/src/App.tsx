import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';

/**
 * Telas de desenvolvimento (Folha de estilo, Paleta): ligadas no `vite dev` e
 * quando o build roda com VITE_DEV_TOOLS=true. Desligadas, nem entram no bundle.
 */
export const devTools = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true';

const DevIndex = devTools ? lazy(() => import('./dev/DevIndex.tsx')) : null;
const StyleSheetPage = devTools ? lazy(() => import('./dev/StyleSheetPage.tsx')) : null;
const PalettePage = devTools ? lazy(() => import('./dev/PalettePage.tsx')) : null;

// HashRouter: o GitHub Pages não tem fallback de SPA, então as rotas vivem depois do #.
export function App() {
  return (
    <HashRouter>
      <Suspense>
        <Routes>
          {DevIndex && <Route path="/dev" element={<DevIndex />} />}
          {StyleSheetPage && <Route path="/dev/estilo" element={<StyleSheetPage />} />}
          {PalettePage && <Route path="/dev/paleta" element={<PalettePage />} />}
          {/* As telas do produto entram a partir da Fase 3. */}
          <Route path="*" element={devTools ? <Navigate to="/dev" replace /> : <main className="devpage" />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
