import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useSession } from './data/session.ts';
import { hasBackend } from './firebase.ts';
import { PrefsSync } from './screens/PrefsSync.tsx';

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
const Entry = lazy(() => import('./screens/Entry.tsx'));
const EmailAuth = lazy(() => import('./screens/EmailAuth.tsx'));
const Account = lazy(() => import('./screens/Account.tsx'));
const Recovery = lazy(() => import('./screens/Recovery.tsx'));
const Redeem = lazy(() => import('./screens/Recovery.tsx').then((m) => ({ default: m.Redeem })));
const Merge = lazy(() => import('./screens/Merge.tsx'));

/** Rotas que funcionam sem login: convite (vira convidado sozinho), link de recuperação e e-mail. */
const OPEN = [/^\/convite\//, /^\/r\//, /^\/email$/];

/** Sem ninguém logado, o produto mostra a tela de entrada (conta é opcional). */
function Gate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const { pathname } = useLocation();
  if (session.status === 'loading') return null;
  if (session.status === 'signedOut' && !OPEN.some((r) => r.test(pathname))) return <Entry />;
  return <>{children}</>;
}

// HashRouter: o GitHub Pages não tem fallback de SPA, então as rotas vivem depois do #.
export function App() {
  return (
    <HashRouter>
      {hasBackend && <PrefsSync />}
      <Suspense>
        <Routes>
          {DevIndex && <Route path="/dev" element={<DevIndex />} />}
          {StyleSheetPage && <Route path="/dev/estilo" element={<StyleSheetPage />} />}
          {PalettePage && <Route path="/dev/paleta" element={<PalettePage />} />}
          {hasBackend ? (
            <>
              <Route path="/" element={<Gate><Home /></Gate>} />
              <Route path="/novo" element={<Gate><CreateSplit /></Gate>} />
              <Route path="/entrar" element={<Gate><Join /></Gate>} />
              <Route path="/convite/:code" element={<Gate><WhoAreYou /></Gate>} />
              <Route path="/s/:id/pronto" element={<Gate><Created /></Gate>} />
              <Route path="/s/:id/:tab?" element={<Gate><Split /></Gate>} />
              <Route path="/conta" element={<Gate><Account /></Gate>} />
              <Route path="/salvar" element={<Gate><Recovery /></Gate>} />
              <Route path="/email" element={<Gate><EmailAuth /></Gate>} />
              <Route path="/r/:token" element={<Gate><Redeem /></Gate>} />
              <Route path="/juntar" element={<Gate><Merge /></Gate>} />
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
