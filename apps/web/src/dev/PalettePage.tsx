import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Segmented, Sheet, useToast } from '../components/index.ts';
import { contrastRatio, isHex, normalizeHex, parseTokens, tokensToCss, type Overrides, type ThemeName, type Token } from '../theme/palette.ts';
import tokensCss from '../theme/tokens.css?raw';
import { ComponentsPanel } from './ComponentsPanel.tsx';
import { MyViewPreview } from './MyViewPreview.tsx';
import { DevBar } from './DevBar.tsx';
import { hasOverrides, setOverrides, useOverrides } from './overrides.ts';

const BASE = parseTokens(tokensCss);

const GROUPS: Array<{ key: string; test: (name: string) => boolean }> = [
  { key: 'groupBase', test: (n) => !/^--(av|cv|shadow|scrim)/.test(n) },
  { key: 'groupAvatars', test: (n) => n.startsWith('--av-') },
  { key: 'groupCovers', test: (n) => n.startsWith('--cv-') },
  { key: 'groupEffects', test: (n) => /^--(shadow|scrim)/.test(n) },
];

/** Pares texto/fundo que precisam de contraste AA. */
const PAIRS: Array<[string, string]> = [
  ['--text', '--bg'],
  ['--text', '--surface'],
  ['--muted', '--bg'],
  ['--muted', '--surface'],
  ['--accent', '--surface'],
  ['--accent-ink', '--accent'],
  ['--accent', '--accent-soft'],
  ['--pos', '--surface'],
  ['--pos', '--pos-soft'],
  ['--neg', '--surface'],
  ['--neg', '--neg-soft'],
  ['--zero', '--surface'],
  ['--zero', '--zero-soft'],
  ['--sun-ink', '--sun'],
  ['--alert-ink', '--alert'],
  ...[1, 2, 3, 4, 5, 6, 7].map((i): [string, string] => [`--av-${i}-ink`, `--av-${i}`]),
];

function TokenRow({ token, value, changed, onChange }: { token: Token; value: string; changed: boolean; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const hex = isHex(value);
  return (
    <div className="tkrow">
      {hex ? (
        <input type="color" className="tk-pick" value={normalizeHex(value).toLowerCase()} aria-label={t('dev.paletteTool.pick', { name: token.name })} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      ) : (
        <span className="tk-pick tk-fx" style={{ boxShadow: `var(${token.name})`, background: `var(${token.name})` }} aria-hidden="true" />
      )}
      <span className="tk-mid">
        <span className="tk-name">
          {token.name}
          {changed && <Badge tone="acc">{t('dev.paletteTool.changed')}</Badge>}
        </span>
        <span className="cap">{token.note}</span>
      </span>
      <input className="input tk-val" value={value} spellCheck={false} aria-label={t('dev.paletteTool.value', { name: token.name })} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function PalettePage() {
  const { t } = useTranslation();
  const toast = useToast();
  const overrides = useOverrides();
  const [theme, setTheme] = useState<ThemeName>(() => (document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light'));
  const [fallback, setFallback] = useState<string | null>(null);

  const tokens = BASE[theme];
  const valueOf = (name: string) => overrides[theme][name] ?? tokens.find((tk) => tk.name === name)?.value ?? '';

  const update = (name: string, value: string) => {
    const base = tokens.find((tk) => tk.name === name)?.value;
    const next = { ...overrides[theme] };
    if (value.trim() === '' || value === base) delete next[name];
    else next[name] = value;
    setOverrides({ ...overrides, [theme]: next } as Overrides);
  };

  const copy = async () => {
    const css = tokensToCss(tokensCss, overrides);
    try {
      await navigator.clipboard.writeText(css);
      toast.show({ text: t('dev.paletteTool.copied') });
    } catch {
      setFallback(css);
    }
  };

  return (
    <main className="devpage wide">
      <DevBar title={t('dev.palette')} />
      <p className="muted pal-intro">{t('dev.paletteTool.intro')}</p>

      <div className="pal-actions">
        <Segmented<ThemeName>
          className="pal-theme"
          label={t('dev.paletteTool.editing')}
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: t('prefs.themeLight') },
            { value: 'dark', label: t('prefs.themeDark') },
          ]}
        />
        <Button onClick={() => void copy()}>{t('dev.paletteTool.copy')}</Button>
        <Button variant="secondary" disabled={!hasOverrides(overrides)} onClick={() => setOverrides({ light: {}, dark: {} })}>
          {t('dev.paletteTool.reset')}
        </Button>
      </div>

      <div className="pal-layout">
        <div className="pal-tokens">
          {GROUPS.map((g) => (
            <section key={g.key} className="card pal-group">
              <h2 className="h4">{t(`dev.paletteTool.${g.key}`)}</h2>
              {tokens
                .filter((tk) => g.test(tk.name))
                .map((tk) => (
                  <TokenRow key={tk.name} token={tk} value={valueOf(tk.name)} changed={tk.name in overrides[theme]} onChange={(v) => update(tk.name, v)} />
                ))}
            </section>
          ))}
        </div>

        <aside className="pal-side">
          <section>
            <p className="sec">{t('dev.paletteTool.preview')}</p>
            <div className={`panel theme-${theme}`}>
              <ComponentsPanel />
            </div>
          </section>
          <section>
            <p className="sec">{t('split.tabs.me')}</p>
            <div className={`panel theme-${theme}`}>
              <MyViewPreview />
            </div>
          </section>
          <section className="card pal-group">
            <h2 className="h4">{t('dev.paletteTool.contrast')}</h2>
            {PAIRS.map(([fg, bg]) => {
              const ratio = contrastRatio(valueOf(fg), valueOf(bg));
              const pass = ratio !== null && ratio >= 4.5;
              return (
                <div key={fg + bg} className={`ctrow theme-${theme}`}>
                  <span className="ct-sample" style={{ color: `var(${fg})`, background: `var(${bg})` }}>
                    Aa
                  </span>
                  <span className="ct-mid cap">
                    {fg} {t('dev.paletteTool.on')} {bg}
                  </span>
                  <span className="amt strong">{ratio === null ? '—' : `${ratio.toFixed(1)}:1`}</span>
                  <Badge tone={pass ? 'pos' : 'neg'} icon={pass ? 'check' : 'alert'}>
                    {t(pass ? 'dev.paletteTool.pass' : 'dev.paletteTool.fail')}
                  </Badge>
                </div>
              );
            })}
          </section>
        </aside>
      </div>

      <Sheet open={fallback !== null} title={t('dev.paletteTool.copy')} onClose={() => setFallback(null)}>
        <p className="muted">{t('dev.paletteTool.copyFallback')}</p>
        <textarea className="input pal-css" readOnly value={fallback ?? ''} onFocus={(e) => e.currentTarget.select()} />
      </Sheet>
    </main>
  );
}
