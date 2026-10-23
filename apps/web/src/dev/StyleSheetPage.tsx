import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Sheet, SkeletonCard, Switch, useToast } from '../components/index.ts';
import { useOptimisticValue } from '../lib/optimistic.ts';
import { isHex, normalizeHex, parseTokens } from '../theme/palette.ts';
import tokensCss from '../theme/tokens.css?raw';
import { ComponentsPanel } from './ComponentsPanel.tsx';
import { DevBar } from './DevBar.tsx';
import { useOverrides } from './overrides.ts';

const SWATCHES = ['--bg', '--surface', '--surface2', '--line', '--text', '--muted', '--accent', '--accent-soft', '--pos', '--pos-soft', '--neg', '--neg-soft', '--zero', '--sun'];
const NOTES = Object.fromEntries(parseTokens(tokensCss).light.map((tk) => [tk.name, tk.note]));

function Swatch({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const overrides = useOverrides();
  useEffect(() => {
    if (!ref.current) return;
    const v = getComputedStyle(ref.current).getPropertyValue(name).trim();
    setValue(isHex(v) ? normalizeHex(v) : v);
  }, [name, overrides]);
  return (
    <div className="sw" ref={ref}>
      <div className="sw-c" style={{ background: `var(${name})` }} />
      <div className="sw-m">
        <b>{name.slice(2)}</b>
        <span className="amt">{value}</span>
        <span>{NOTES[name]}</span>
      </div>
    </div>
  );
}

function Panels({ children }: { children: (theme: 'light' | 'dark') => React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="panels">
      {(['light', 'dark'] as const).map((theme) => (
        <div key={theme} className={`panel theme-${theme}`}>
          <h2 className="h2 panel-h">{t(theme === 'light' ? 'prefs.themeLight' : 'prefs.themeDark')}</h2>
          {children(theme)}
        </div>
      ))}
    </div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function OptimisticDemo() {
  const { t } = useTranslation();
  const [okServer, setOkServer] = useState(false);
  const [ok, setOk] = useOptimisticValue(okServer, async (v: boolean) => {
    await wait(600);
    setOkServer(v);
  });
  const [failServer] = useState(false);
  const [fail, setFail] = useOptimisticValue(failServer, async () => {
    await wait(1000);
    throw new Error('permission-denied');
  });
  return (
    <div className="opt-demo">
      <label className="opt-row">
        <span>{t('dev.samples.optimisticOk')}</span>
        <Switch label={t('dev.samples.optimisticOk')} checked={ok} onChange={setOk} />
      </label>
      <label className="opt-row">
        <span>{t('dev.samples.optimisticFail')}</span>
        <Switch label={t('dev.samples.optimisticFail')} checked={fail} onChange={setFail} />
      </label>
      <p className="cap">{t('dev.samples.optimisticHint')}</p>
    </div>
  );
}

export default function StyleSheetPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);

  return (
    <main className="devpage wide">
      <DevBar title={t('dev.styleSheet')} />

      <section>
        <p className="sec">{t('dev.sectionPalette')}</p>
        <Panels>
          {() => (
            <div className="swatches">
              {SWATCHES.map((n) => (
                <Swatch key={n} name={n} />
              ))}
            </div>
          )}
        </Panels>
      </section>

      <section>
        <p className="sec">{t('dev.sectionComponents')}</p>
        <Panels>{() => <ComponentsPanel />}</Panels>
      </section>

      <section>
        <p className="sec">{t('dev.sectionInteractive')}</p>
        <div className="interactive">
          <div>
            <p className="lab">{t('dev.sections.toast')}</p>
            <Button variant="secondary" onClick={() => toast.show({ text: t('dev.samples.expenseAdded'), onUndo: () => {} })}>
              {t('dev.samples.showToast')}
            </Button>
          </div>
          <div>
            <p className="lab">{t('dev.sections.sheet')}</p>
            <Button variant="secondary" onClick={() => setSheet(true)}>
              {t('dev.samples.openSheet')}
            </Button>
          </div>
          <div>
            <p className="lab">{t('dev.sections.optimistic')}</p>
            <OptimisticDemo />
          </div>
          <div>
            <p className="lab">{t('dev.sections.skeleton')}</p>
            <SkeletonCard />
          </div>
        </div>
      </section>

      <Sheet open={sheet} title={t('dev.samples.sheetTitle')} onClose={() => setSheet(false)}>
        <p className="muted">{t('dev.samples.sheetBody')}</p>
        <Button block onClick={() => setSheet(false)}>
          {t('common.close')}
        </Button>
      </Sheet>
    </main>
  );
}
