import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { cleanName, currencyFromLocales, findDuplicate, isValidName, nameKey, pickCover, SPLIT_DEFAULT_ICON, SPLIT_NAME_MAX, splitCover, type Currency, type EntryIcon } from '@qpq/shared';
import { CurrencyPicker } from './CurrencyPicker.tsx';
import { Avatar, avatarColor, Badge, Button, Cover, Icon, TextField, useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { useMySplits, useProfileName } from '../data/hooks.ts';
import { useSession } from '../data/session.ts';
import { BackLink } from './common.tsx';
import { CreatedView } from './Created.tsx';
import { IconPicker } from './EntryIcon.tsx';
import { PhotoCropSheet } from './PhotoCrop.tsx';
import { useUploadCover } from './Photos.tsx';
import { useReasonText } from './reasons.ts';

export default function CreateSplit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const reasonText = useReasonText();
  const session = useSession();
  const profileName = useProfileName(session.status === 'ready' ? session.uid : null);

  const [name, setName] = useState('');
  // Capa: ícone ou emoji ou foto recortada. Sem escolha, um ícone sorteado entre os curados,
  // evitando os que você já usa (para os splits não ficarem todos iguais na lista).
  const [icon, setIcon] = useState<EntryIcon | null>(null);
  const mySplits = useMySplits(session.status === 'ready' ? session.uid : null);
  const [auto, setAuto] = useState<EntryIcon>(() => pickCover([]));
  const autoChecked = useRef(false);
  useEffect(() => {
    if (mySplits.status !== 'ready' || autoChecked.current) return;
    autoChecked.current = true;
    const taken = mySplits.data.map(splitCover);
    if (taken.some((c) => JSON.stringify(c) === JSON.stringify(auto))) setAuto(pickCover(taken));
  }, [mySplits, auto]);
  const cover = icon ?? auto;
  const [picking, setPicking] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [selfName, setSelfName] = useState('');
  const [selfTouched, setSelfTouched] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  // Moeda: vem marcada pelo país do navegador (en-US → USD, pt-BR → BRL…).
  const [currency, setCurrency] = useState<Currency>(() => currencyFromLocales(navigator.languages ?? [navigator.language]));
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | undefined>();
  const [created, setCreated] = useState<{ name: string; icon: EntryIcon } | null>(null);
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
    setCreated({ name: cleanName(name), icon: cover });
    try {
      const res = await api.createSplit({ name, icon: cover, selfName, people, currency });
      if (photo) uploadCover(res.splitId, photo);
      if (mounted.current) void navigate(`/s/${res.splitId}/pronto`, { replace: true });
    } catch (error) {
      if (!mounted.current) return;
      setCreated(null);
      toast.show({ kind: 'error', text: reasonText(detailsOf(error)) });
    }
  };

  if (created) return <CreatedView splitId={null} name={created.name} icon={created.icon} code={null} previewUrl={photoUrl} />;

  return (
    <main className="page">
      <header className="hdr">
        <BackLink to="/" label={t('common.close')} icon="x" />
        <h1 className="h3 hdr-mid">{t('create.title')}</h1>
      </header>
      <div className="content form">
        <div className="name-cover">
          <button type="button" className="cover-pick" aria-label={t('create.coverPick')} title={t('create.coverPick')} onClick={() => setPicking(true)}>
            <Cover icon={cover} src={photoUrl} />
            <span className="cover-edit" aria-hidden="true">
              <Icon name="pencil" size="sm" />
            </span>
          </button>
          <TextField label={`${t('create.name')} *`} placeholder={t('create.namePh')} value={name} maxLength={SPLIT_NAME_MAX} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </div>
        <IconPicker
          open={picking}
          value={cover}
          removeTo={SPLIT_DEFAULT_ICON}
          onClose={() => setPicking(false)}
          onChange={(next) => {
            setIcon(next);
            setPhoto(null);
          }}
          photo={{ has: !!photo, onFile: setCropFile }}
        />
        <PhotoCropSheet
          file={cropFile}
          kind="cover"
          name={name}
          icon={cover}
          onCancel={() => setCropFile(null)}
          onDone={(cropped) => {
            setPhoto(cropped);
            setCropFile(null);
          }}
        />

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

        <div className="currency-row">
          <label className="label" htmlFor="create-currency">
            {t('currency.label')}
          </label>
          <CurrencyPicker id="create-currency" value={currency} onChange={setCurrency} />
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
