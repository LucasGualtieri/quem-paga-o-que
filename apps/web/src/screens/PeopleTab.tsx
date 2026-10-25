import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Icon, InfoTip, Sheet, useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { useProfile } from '../data/hooks.ts';
import { useSession } from '../data/session.ts';
import { useOptimisticAction, useOptimisticValue } from '../lib/optimistic.ts';
import type { ProofVisibility } from '@qpq/shared';
import { adminContact, adminHandover, balances, membersInOrder, promoteBlock, removeBlock, type Member, type MemberPatch, type Money, type SplitDoc } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';
import { InviteBox } from './Created.tsx';
import { useReasonText } from './reasons.ts';
import { MemberAvatar } from './Photos.tsx';

/** Uma ou mais mudanças em participantes (ex.: deixar de ser admin e o herdeiro virar admin). */
export type PeopleAction = (patch: MemberPatch | MemberPatch[], commit: () => Promise<unknown>, done?: string) => void;

/** Aba Pessoas: admin gerencia; membro vê o cadeado e "fale com…" (spec 04, decisões 3 e 4). */
export function PeopleTab({ split, money, me, act }: { split: SplitDoc; money: Money; me: Member; act: PeopleAction }) {
  const { t } = useTranslation();
  const lang = useLang();
  const reasonText = useReasonText();
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null);
  const [newCode, setNewCode] = useState(false);
  const [code, setCode] = useState<string | null>(split.code);
  const run = useOptimisticAction();
  const toast = useToast();
  const session = useSession();
  const profile = useProfile(session.status === 'ready' ? session.uid : null);
  // "Você" × nome (spec 08): com o nome, a lista não põe "(você)".
  const selfName = profile.status === 'ready' && !!profile.data.prefs.selfName;

  // Quando o snapshot traz um código diferente, ele vence; até lá, o carregando ocupa o lugar.
  const [seenCode, setSeenCode] = useState(split.code);
  if (split.code !== seenCode) {
    setSeenCode(split.code);
    setCode(split.code);
  }

  const regenerate = () => {
    setNewCode(false);
    const old = split.code;
    void run({
      apply: () => {
        setCode(null);
        return () => setCode(old);
      },
      commit: async () => {
        const res = await api.regenerateCode({ splitId: split.id });
        setCode(res.code);
        toast.show({ text: t('invite.done') });
      },
      errorText: (e) => reasonText(detailsOf(e)),
    });
  };
  const members = membersInOrder(split);
  const nets = balances(split, money);
  const isAdmin = me.admin;

  const block = (m: Member, b: ReturnType<typeof removeBlock>) => {
    if (!b) return false;
    setMsg({ id: m.id, text: reasonText({ reason: b.reason, name: m.name, ...(b.amount !== undefined ? { amount: b.amount } : {}) }) });
    return true;
  };

  const [steppingDown, setSteppingDown] = useState(false);
  const handover = adminHandover(split, me.id);
  /** Deixar de ser admin; sendo o último, o papel passa para quem entrou primeiro (decisão 4). */
  const stepDown = () => {
    setSteppingDown(false);
    setMsg(null);
    const patches: MemberPatch[] = [{ memberId: me.id, change: { admin: false } }];
    if (handover?.heir) patches.push({ memberId: handover.heir.id, change: { admin: true } });
    act(patches, () => api.setAdmin({ splitId: split.id, memberId: me.id, admin: false }), handover?.heir ? t('handover.done', { name: handover.heir.name }) : t('handover.doneNone'));
  };

  const setAdmin = (m: Member, admin: boolean) => {
    if (block(m, promoteBlock(split, m.id, admin))) return;
    setMsg(null);
    act({ memberId: m.id, change: { admin } }, () => api.setAdmin({ splitId: split.id, memberId: m.id, admin }));
  };
  const release = (m: Member) => {
    setMsg(null);
    act(
      { memberId: m.id, change: { uid: null, admin: false } },
      () => api.releaseName({ splitId: split.id, memberId: m.id }),
      t('people.released', { name: m.name }),
    );
  };
  const remove = (m: Member) => {
    if (block(m, removeBlock(split, money, m.id))) return;
    setMsg(null);
    act(
      { memberId: m.id, change: 'removed' },
      () => api.removeMember({ splitId: split.id, memberId: m.id }),
      t('people.removed', { name: m.name }),
    );
  };

  const otherAdmins = members.filter((m) => m.admin && m.id !== me.id).map((m) => m.name);
  const [visibility, setVisibility] = useOptimisticValue<ProofVisibility>(split.proofVisibility ?? 'all', saveVisibility);

  function saveVisibility(value: ProofVisibility) {
    return api.setProofVisibility({ splitId: split.id, value });
  }

  return (
    <div className="content with-tabs" style={{ gap: 18 }}>
      {isAdmin ? (
        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="link" className="accent-ic" />
            <h2 className="h4" style={{ flex: 1 }}>
              {t('people.invite')}
            </h2>
          </div>
          <p className="cap">{t('people.inviteBody')}</p>
          <InviteBox code={code} splitName={split.name} />
          <Button variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setNewCode(true)}>
            {t('invite.regenerate')}
          </Button>
        </div>
      ) : (
        <div className="info">
          <Icon name="lock" />
          <span>
            <strong>{t('people.lockT')}</strong>
            {t('people.lockB', { who: adminContact(otherAdmins, (k, o) => t(k, o ?? {})) })}
          </span>
        </div>
      )}

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('people.members')}</h2>
          <span className="cap amt">{members.length}</span>
        </div>
        <div className="list">
          {members.map((m) => {
            const mine = m.id === me.id;
            const c = nets[m.id] ?? 0;
            const status = !m.uid ? t('people.notJoined') : m.isNew ? t('people.arrived') : null;
            return (
              <div key={m.id} className={`row2 ${mine ? 'me-row' : ''}`}>
                <div className="top">
                  <MemberAvatar member={m} size="lg" />
                  <span className="mid">
                    <span className="ttl">
                      {m.name}
                      {mine && !selfName ? t('people.youSuffix') : ''}
                    </span>
                    <span className="cap amt">
                      {c === 0 ? t('people.settled') : t('people.balance', { amount: formatCents(c, lang, { signed: true }).replace(' ', '\u00a0') })}
                      {status ? ` · ${status}` : ''}
                    </span>
                  </span>
                  <Badge tone={m.admin ? 'acc' : 'zero'}>{m.admin ? t('people.admin') : t('people.member')}</Badge>
                </div>
                {isAdmin && !mine && (
                  <div className="acts">
                    {(m.admin || m.uid) && (
                      <Button variant="secondary" size="sm" onClick={() => setAdmin(m, !m.admin)}>
                        {m.admin ? t('people.removeAdmin') : t('people.makeAdmin')}
                      </Button>
                    )}
                    {m.uid && (
                      <span className="act-tip">
                        <Button variant="secondary" size="sm" onClick={() => release(m)}>
                          {t('people.release')}
                        </Button>
                        <InfoTip label={t('tips.releaseLabel')} text={t('tips.release')} />
                      </span>
                    )}
                    <Button variant="danger" size="sm" aria-label={t('people.removeAria', { name: m.name })} icon={<Icon name="trash" size="sm" />} onClick={() => remove(m)}>
                      {t('people.remove')}
                    </Button>
                  </div>
                )}
                {isAdmin && mine && (
                  <div className="acts">
                    <Button variant="secondary" size="sm" onClick={() => (handover ? setSteppingDown(true) : setAdmin(m, false))}>
                      {t('people.stepDown')}
                    </Button>
                  </div>
                )}
                {msg?.id === m.id && (
                  <div className="alert" role="alert">
                    <Icon name="alert" size="sm" />
                    <span>{msg.text}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('proofVis.title')}</h2>
        </div>
        {isAdmin ? (
          <div className="list" role="radiogroup" aria-label={t('proofVis.title')}>
            {(['all', 'involved'] as const).map((v) => (
              <label key={v} className="optrow">
                <input type="radio" name="proof-visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
                <span className="mid">
                  <span className="ttl">{t(`proofVis.${v}`)}</span>
                  <span className="cap" style={{ whiteSpace: 'normal' }}>
                    {t(v === 'all' ? 'proofVis.allSub' : 'proofVis.involvedSub')}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="cap" style={{ padding: '0 4px' }}>
            {t('proofVis.memberNote', { value: t(`proofVis.${visibility}`) })}
          </p>
        )}
      </section>

      <Sheet open={steppingDown} title={t('handover.stepT')} onClose={() => setSteppingDown(false)}>
        <p className="muted">{handover?.heir ? t('handover.stepHeir', { name: handover.heir.name }) : t('handover.stepNext')}</p>
        <div className="sheet-acts">
          <Button block onClick={stepDown}>
            {t('people.stepDown')}
          </Button>
          <Button variant="ghost" block onClick={() => setSteppingDown(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>

      <Sheet open={newCode} title={t('invite.confirmT')} onClose={() => setNewCode(false)}>
        <p className="muted">{t('invite.confirmB')}</p>
        <div className="sheet-acts">
          <Button block onClick={regenerate}>
            {t('invite.regenerate')}
          </Button>
          <Button variant="ghost" block onClick={() => setNewCode(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
