import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { cleanName, isValidName } from '@qpq/shared';
import { Avatar, Button, Card, Icon, Segmented, Sheet, SkeletonCard, useToast, type IconName } from '../components/index.ts';
import { sendPasswordReset } from '../data/account.ts';
import { api } from '../data/api.ts';
import { saveProfile, useProfile, type Prefs } from '../data/hooks.ts';
import { logout, useSession } from '../data/session.ts';
import { setLang, useLang, type Lang } from '../i18n/index.ts';
import { useOptimisticAction, useOptimisticValue } from '../lib/optimistic.ts';
import { setTheme, useTheme, type Theme } from '../theme/theme.ts';
import { BackLink } from './common.tsx';
import { useShortDate } from './Recovery.tsx';

/** Linha com interruptor: a linha inteira é o role="switch" (protótipo, setrow). */
function SwitchRow({ icon, title, caption, checked, disabled, onChange }: { icon: IconName; title: string; caption: ReactNode; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="setrow" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
      <Icon name={icon} />
      <span className="mid">
        <span className="ttl">{title}</span>
        <span className="cap">{caption}</span>
      </span>
      <span className={`tgl ${checked ? 'on' : ''}`} aria-hidden="true">
        <span className="knob" />
      </span>
    </button>
  );
}

/** Preferência com UX otimista: muda na hora e volta se a gravação falhar. */
function usePref<K extends keyof Prefs>(uid: string, prefs: Prefs, key: K, fallback: NonNullable<Prefs[K]>) {
  return useOptimisticValue<NonNullable<Prefs[K]>>((prefs[key] ?? fallback) as NonNullable<Prefs[K]>, (v) => saveProfile(uid, { prefs: { [key]: v } }));
}

function AccountBody({ uid, isAnonymous, email, hasPassword, name, prefs, recovery }: { uid: string; isAnonymous: boolean; email: string | null; hasPassword: boolean; name: string; prefs: Prefs; recovery: { active: boolean; createdAt: Date | null } }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const run = useOptimisticAction();
  const date = useShortDate();
  const theme = useTheme();
  const lang = useLang();
  const [draft, setDraft] = useState(name);
  const [leaving, setLeaving] = useState(false);
  const [inapp, setInapp] = usePref(uid, prefs, 'inapp', true);
  const [byEmail, setByEmail] = usePref(uid, prefs, 'email', true);
  const [selfName, setSelfName] = usePref(uid, prefs, 'selfName', false);
  const [askProof, setAskProof] = usePref(uid, prefs, 'askProof', false);
  const [recActive, setRecActive] = useState(recovery.active);

  useEffect(() => setDraft(name), [name]);
  useEffect(() => setRecActive(recovery.active), [recovery.active]);

  const saveName = () => {
    const n = cleanName(draft);
    if (!isValidName(n) || n === name) {
      setDraft(name);
      return;
    }
    void run({ apply: () => () => setDraft(name), commit: () => saveProfile(uid, { displayName: n }) });
  };

  const revoke = () =>
    void run({
      apply: () => {
        setRecActive(false);
        return () => setRecActive(true);
      },
      commit: async () => {
        await api.revokeRecovery({});
        toast.show({ text: t('recovery.revoked') });
      },
    });

  const doLogout = async () => {
    setLeaving(false);
    await logout();
    void navigate('/', { replace: true });
  };

  return (
    <div className="content" style={{ gap: 20, paddingBottom: 40 }}>
      <div className="profile-head">
        <Avatar name={name || '?'} color={1} className="xl" />
      </div>

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('account.profile')}</h2>
        </div>
        <Card className="card-pad" style={{ gap: 14 }}>
          <div className="field">
            <label className="label" htmlFor="ac-name">
              {t('account.name')}
            </label>
            <input
              id="ac-name"
              className="input"
              value={draft}
              autoComplete="given-name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>
          <div>
            <span className="label">{t('account.callMe')}</span>
            <Segmented<'you' | 'name'>
              label={t('account.callMe')}
              value={selfName ? 'name' : 'you'}
              onChange={(v) => setSelfName(v === 'name')}
              options={[
                { value: 'you', label: t('account.youCap') },
                { value: 'name', label: name || t('account.name') },
              ]}
            />
            <p className="hint">{t('account.callHint')}</p>
          </div>
          {!isAnonymous && (
            <>
              <div className="field">
                <label className="label" htmlFor="ac-email">
                  {t('account.email')}
                </label>
                {/* Só leitura na v1 (decisão da Fase 4). */}
                <input id="ac-email" className="input" type="email" value={email ?? ''} readOnly />
              </div>
              {hasPassword && email && (
                <button
                  type="button"
                  className="setrow setrow-plain"
                  onClick={() => {
                    void sendPasswordReset(email).catch(() => {});
                    toast.show({ text: t('email.resetSent') });
                  }}
                >
                  <Icon name="lock" />
                  <span className="mid">
                    <span className="ttl">{t('account.password')}</span>
                    <span className="cap">{t('account.passwordSub')}</span>
                  </span>
                  <Icon name="chevron" size="sm" />
                </button>
              )}
            </>
          )}
          {isAnonymous && (
            <>
              <div className="info">
                <Icon name="shield" />
                <span>{t('home.guestBanner')}</span>
              </div>
              <Link to="/salvar" className="btn btn-p btn-block">
                {t('account.saveAcc')}
              </Link>
              <div className="pref-line">
                <span className="mid">
                  <span className="ttl">{t('recovery.row')}</span>
                  <span className="cap">{recActive ? t('recovery.activeShort', { date: date(recovery.createdAt) }) : t('recovery.none')}</span>
                </span>
                {recActive && (
                  <Button variant="secondary" size="sm" onClick={revoke}>
                    {t('recovery.revoke')}
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      </section>

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('account.notifsT')}</h2>
        </div>
        <p className="cap" style={{ padding: '0 4px 10px' }}>
          {t('account.notifsWhy')}
        </p>
        {/* Push só existe no app nativo; no navegador a opção nem aparece (spec 07). */}
        <div className="list">
          <SwitchRow icon="bell" title={t('account.inappT')} caption={t('account.inappB')} checked={inapp} onChange={setInapp} />
          <SwitchRow
            icon="mail"
            title={t('account.emailT')}
            caption={isAnonymous ? t('account.emailGuest') : t('account.emailTo', { email: email ?? '' })}
            checked={byEmail && !isAnonymous}
            disabled={isAnonymous}
            onChange={setByEmail}
          />
        </div>
      </section>

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('account.paymentsT')}</h2>
        </div>
        <div className="list">
          <SwitchRow icon="camera" title={t('account.askProofT')} caption={askProof ? t('account.askProofOn') : t('account.askProofOff')} checked={askProof} onChange={setAskProof} />
        </div>
      </section>

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('account.appearance')}</h2>
        </div>
        <Card className="card-pad" style={{ gap: 12 }}>
          <div className="pref-line">
            <span className="ttl">{t('prefs.theme')}</span>
            <Segmented<Theme>
              label={t('prefs.theme')}
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: t('prefs.themeLight') },
                { value: 'dark', label: t('prefs.themeDark') },
              ]}
            />
          </div>
          <div className="pref-line">
            <span className="ttl">{t('prefs.language')}</span>
            <Segmented<Lang>
              label={t('prefs.language')}
              value={lang}
              onChange={(l) => void setLang(l)}
              options={[
                { value: 'pt-BR', label: t('account.portuguese') },
                { value: 'en', label: t('account.english') },
              ]}
            />
          </div>
        </Card>
      </section>

      <Button variant="danger" block onClick={() => (isAnonymous ? setLeaving(true) : void doLogout())}>
        {t('account.logout')}
      </Button>

      <Sheet open={leaving} title={t('account.guestLogoutT')} onClose={() => setLeaving(false)}>
        <p className="muted">{t('account.guestLogoutB')}</p>
        <div className="sheet-acts">
          <Link to="/salvar" className="btn btn-p btn-block">
            {t('account.keepLink')}
          </Link>
          <Button variant="danger" block onClick={() => void doLogout()}>
            {t('account.logoutAnyway')}
          </Button>
          <Button variant="ghost" block onClick={() => setLeaving(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export default function Account() {
  const { t } = useTranslation();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const profile = useProfile(uid);
  return (
    <main className="page">
      <header className="hdr">
        <BackLink to="/" label={t('common.back')} />
        <h1 className="h3 hdr-mid">{t('account.title')}</h1>
      </header>
      {(session.status !== 'ready' || profile.status !== 'ready') && (
        <div className="content sk-stack" aria-busy="true" aria-label={t('common.loading')}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
      {session.status === 'ready' && profile.status === 'ready' && (
        <AccountBody
          uid={session.uid}
          isAnonymous={session.isAnonymous}
          email={session.email}
          hasPassword={session.hasPassword}
          name={profile.data.displayName}
          prefs={profile.data.prefs}
          recovery={profile.data.recovery}
        />
      )}
    </main>
  );
}
