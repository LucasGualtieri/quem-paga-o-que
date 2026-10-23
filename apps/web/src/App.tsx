import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { hasBackend } from './firebase.ts';

/**
 * Telas de desenvolvimento (Folha de estilo, Paleta): ligadas no `vite dev` e
 * quando o build roda com VITE_DEV_TOOLS=true. Desligadas, nem entram no bundle.
 */
export const devTools = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true';

const DevIndex = devTools ? lazy(() => import('./dev/DevIndex.tsx')) : null;
const StyleSheetPage = devTools ? lazy(() => import('./dev/StyleSheetPage.tsx')) : null;
const PalettePage = devTools ? lazy(() => import('./dev/PalettePage.tsx')) : null;

const Home = lazy(() => import('./screens/Home.tsx'));
const CreateSplit = lazy(() => import('./screens/CreateSplit.tsx'));
const Created = lazy(() => import('./screens/Created.tsx'));
const Join = lazy(() => import('./screens/Join.tsx'));
const WhoAreYou = lazy(() => import('./screens/WhoAreYou.tsx'));
const Split = lazy(() => import('./screens/Split.tsx'));

// HashRouter: o GitHub Pages não tem fallback de SPA, então as rotas vivem depois do #.
export function App() {
  return (
    <HashRouter>
      <Suspense>
        <Routes>
          {DevIndex && <Route path="/dev" element={<DevIndex />} />}
          {StyleSheetPage && <Route path="/dev/estilo" element={<StyleSheetPage />} />}
          {PalettePage && <Route path="/dev/paleta" element={<PalettePage />} />}
          {hasBackend ? (
            <>
              <Route path="/" element={<Home />} />
              <Route path="/novo" element={<CreateSplit />} />
              <Route path="/entrar" element={<Join />} />
              <Route path="/convite/:code" element={<WhoAreYou />} />
              <Route path="/s/:id/pronto" element={<Created />} />
              <Route path="/s/:id/:tab?" element={<Split />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            // Sem back-end configurado (ex.: Pages antes do projeto de staging existir).
            <Route path="*" element={devTools ? <Navigate to="/dev" replace /> : <main className="page" />} />
          )}
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
