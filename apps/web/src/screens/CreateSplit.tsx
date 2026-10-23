import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { cleanName, COVER_EMOJIS, findDuplicate, isValidName, nameKey, SPLIT_NAME_MAX } from '@qpq/shared';
import { Avatar, avatarColor, Badge, Button, Icon, TextField, useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { useProfileName } from '../data/hooks.ts';
import { useSession } from '../data/session.ts';
import { BackLink } from './common.tsx';
import { CreatedView } from './Created.tsx';
import { useUploadCover } from './Photos.tsx';
import { useReasonText } from './reasons.ts';

const EMOJI_KEYS = ['fireworks', 'gift', 'mountain', 'pizza', 'beach', 'party', 'cheers', 'camping'] as const;

export default function CreateSplit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const reasonText = useReasonText();
  const session = useSession();
  const profileName = useProfileName(session.status === 'ready' ? session.uid : null);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(COVER_EMOJIS[0]);
  const [selfName, setSelfName] = useState('');
  const [selfTouched, setSelfTouched] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | undefined>();
  const [created, setCreated] = useState<{ name: string; emoji: string } | null>(null);
  // Capa com foto (opcional): sobe depois que o split existe; até lá aparece daqui.
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const uploadCover = useUploadCover();
  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  // Se a pessoa sair da tela antes do servidor responder, não a puxamos de volta.
  // (Marca de novo ao montar: no StrictMode do dev o efeito roda, desmonta e roda outra vez.)
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Seu nome vem preenchido do perfil (decisão da Fase 3), até você mexer nele.
  useEffect(() => {
    if (!selfTouched && profileName) setSelfName(profileName);
  }, [profileName, selfTouched]);

  const dupText = (n: string) => t('reasons.name-taken', { name: cleanName(n) });

  const add = () => {
    const n = cleanName(newName);
    if (!n) return;
    const existing = [selfName, ...people].find((p) => nameKey(p) === nameKey(n));
    if (existing !== undefined) {
      setAddError(dupText(existing));
      return;
    }
    setPeople([...people, n]);
    setNewName('');
    setAddError(undefined);
  };

  const canCreate = isValidName(name, SPLIT_NAME_MAX) && isValidName(selfName) && session.status === 'ready';

  const submit = async () => {
    const dup = findDuplicate([selfName, ...people]);
    if (dup !== null) {
      setAddError(dupText(dup));
      return;
    }
    // Otimista: a tela do convite abre na hora; link e código chegam em seguida.
    setCreated({ name: cleanName(name), emoji });
    try {
      const res = await api.createSplit({ name, emoji, selfName, people });
      if (photo) uploadCover(res.splitId, photo);
      if (mounted.current) void navigate(`/s/${res.splitId}/pronto`, { replace: true });
    } catch (error) {
      if (!mounted.current) return;
      setCreated(null);
      toast.show({ kind: 'error', text: reasonText(detailsOf(error)) });
    }
  };

  if (created) return <CreatedView splitId={null} name={created.name} emoji={created.emoji} code={null} previewUrl={photoUrl} />;

  return (
    <main className="page">
      <header className="hdr">
        <BackLink to="/" label={t('common.close')} icon="x" />
        <h1 className="h3 hdr-mid">{t('create.title')}</h1>
      </header>
      <div className="content form">
        <TextField label={`${t('create.name')} *`} placeholder={t('create.namePh')} value={name} maxLength={SPLIT_NAME_MAX} autoComplete="off" onChange={(e) => setName(e.target.value)} />

        <div>
          <span className="label">
            {t('create.cover')} <span className="opt">· {t('common.optional')}</span>
          </span>
          <div className="emojis" role="group" aria-label={t('create.cover')}>
            {COVER_EMOJIS.map((e, i) => (
              <button
                key={e}
                type="button"
                className={`emo ${!photo && emoji === e ? 'on' : ''}`}
                aria-pressed={!photo && emoji === e}
                aria-label={t(`create.emoji.${EMOJI_KEYS[i]}`)}
                onClick={() => {
                  setEmoji(e);
                  setPhoto(null);
                }}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="filerow" style={{ marginTop: 8 }}>
            <label className={`filebtn ${photo ? 'on' : ''}`}>
              <input type="file" accept="image/*" onChange={(ev) => ev.target.files?.[0] && setPhoto(ev.target.files[0])} />
              {photoUrl ? <img className="thumb" src={photoUrl} alt="" /> : <Icon name="camera" />}
              <span>{photo ? t('photo.groupChosen') : t('photo.group')}</span>
            </label>
            {photo && (
              <button type="button" className="iconbtn" aria-label={t('photo.remove')} onClick={() => setPhoto(null)}>
                <Icon name="x" />
              </button>
            )}
          </div>
        </div>

        <div>
          <span className="label">
            {t('create.participants')} · <span className="amt">{people.length + 1}</span>
          </span>
          <div className="list">
            <div className="row">
              <Avatar name={selfName || '?'} color={avatarColor(0)} />
              <span className="mid">
                <input
                  className="input self-input"
                  value={selfName}
                  placeholder={t('create.yourNamePh')}
                  aria-label={t('create.yourName')}
                  autoComplete="given-name"
                  onChange={(e) => {
                    setSelfTouched(true);
                    setSelfName(e.target.value);
                  }}
                />
              </span>
              <span className="cap">({t('create.you')})</span>
              <Badge tone="acc">{t('people.admin')}</Badge>
            </div>
            {people.map((p, i) => (
              <div key={p} className="row row-tight">
                <Avatar name={p} color={avatarColor(i + 1)} />
                <span className="mid">
                  <span className="ttl">{p}</span>
                </span>
                <button type="button" className="iconbtn" aria-label={t('create.removePerson', { name: p })} onClick={() => setPeople(people.filter((x) => x !== p))}>
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
          <div className="add-row">
            <TextField
              label={t('create.personPh')}
              hideLabel
              placeholder={t('create.personPh')}
              value={newName}
              error={addError}
              autoComplete="off"
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Button variant="secondary" className="btn-sq" aria-label={t('create.add')} onClick={add}>
              <Icon name="plus" />
            </Button>
          </div>
          <p className="hint">{t('create.addHint')}</p>
        </div>
      </div>
      <div className="bottombar">
        <Button block disabled={!canCreate} onClick={() => void submit()}>
          {t('create.submit')}
        </Button>
      </div>
    </main>
  );
}
