import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ICON_CHOICES, nameKey, resolveIcon, type EntryIcon } from '@qpq/shared';
import { Icon, Segmented, Sheet, type IconName } from '../components/index.ts';
import { useLang } from '../i18n/index.ts';
import { cx } from '../lib/cx.ts';

/** Ícone ou emoji de uma despesa (automático pela tag) ou de um item (padrão de item). */
export function EntryIconView({ icon, fallback, size }: { icon: EntryIcon | null | undefined; fallback: { tags: readonly string[] } | 'item'; size?: 'lg' | 'sm' }) {
  const shown = resolveIcon(icon, fallback);
  return (
    <span className={cx('tagico', size)} aria-hidden="true">
      {shown.kind === 'emoji' ? <span className="emoji">{shown.value}</span> : <Icon name={shown.name as IconName} {...(size === 'lg' ? { size: 'lg' as const } : {})} />}
    </span>
  );
}

interface EmojiRow {
  unicode: string;
  label: string;
  tags?: string[];
}

let emojiCache: Partial<Record<'pt' | 'en', Promise<EmojiRow[]>>> = {};

/** Todos os emojis com nome e palavras-chave no idioma (carrega só ao abrir a aba). */
function loadEmojis(lang: 'pt' | 'en'): Promise<EmojiRow[]> {
  emojiCache[lang] ??= (lang === 'pt' ? import('emojibase-data/pt/compact.json') : import('emojibase-data/en/compact.json')).then((m) =>
    (m.default as unknown as Array<EmojiRow & { group?: number }>).filter((e) => e.group !== 2).map((e) => ({ unicode: e.unicode, label: e.label, ...(e.tags ? { tags: e.tags } : {}) })),
  );
  return emojiCache[lang]!;
}

/** Só para testes. */
export function resetEmojiCache(): void {
  emojiCache = {};
}

/**
 * Seletor como o do Notion: aba "Ícones" (coleção do app) ou "Emoji" (todos), com busca;
 * "Remover" volta para o automático. Com `photo` (capa do split), também oferece "Enviar foto".
 */
export function IconPicker({ open, value, onChange, onClose, photo }: { open: boolean; value: EntryIcon | null | undefined; onChange: (icon: EntryIcon | null) => void; onClose: () => void; photo?: { has: boolean; onFile: (file: File) => void } }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [tab, setTab] = useState<'icon' | 'emoji'>(value?.kind === 'emoji' ? 'emoji' : 'icon');
  const [q, setQ] = useState('');
  const [emojis, setEmojis] = useState<EmojiRow[] | null>(null);
  const needle = nameKey(q);

  useEffect(() => {
    if (!open || tab !== 'emoji') return;
    let alive = true;
    void loadEmojis(lang === 'en' ? 'en' : 'pt').then((list) => alive && setEmojis(list));
    return () => {
      alive = false;
    };
  }, [open, tab, lang]);

  const icons = useMemo(() => ICON_CHOICES.filter((n) => !needle || nameKey(t(`icons.${n}`)).includes(needle)), [needle, t]);
  const emojiShown = useMemo(() => {
    if (!emojis) return [];
    if (!needle) return emojis.slice(0, 400);
    return emojis.filter((e) => nameKey(e.label).includes(needle) || (e.tags ?? []).some((x) => nameKey(x).includes(needle))).slice(0, 400);
  }, [emojis, needle]);

  const pick = (icon: EntryIcon | null) => {
    onChange(icon);
    onClose();
  };

  return (
    <Sheet open={open} title={photo ? t('iconPicker.coverTitle') : t('iconPicker.title')} onClose={onClose}>
      {photo && (
        <label className="filebtn">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              onClose();
              photo.onFile(file);
            }}
          />
          <Icon name="camera" />
          <span>{t('iconPicker.photo')}</span>
        </label>
      )}
      <Segmented<'icon' | 'emoji'>
        label={t('iconPicker.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'icon', label: t('iconPicker.icons') },
          { value: 'emoji', label: t('iconPicker.emoji') },
        ]}
      />
      <div className="search">
        <Icon name="search" size="sm" />
        <input className="input" value={q} placeholder={t('iconPicker.search')} aria-label={t('iconPicker.search')} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="icon-grid" role="listbox" aria-label={tab === 'icon' ? t('iconPicker.icons') : t('iconPicker.emoji')}>
        {tab === 'icon'
          ? icons.map((n) => (
              <button key={n} type="button" role="option" aria-selected={value?.kind === 'icon' && value.name === n} className={cx('icon-opt', value?.kind === 'icon' && value.name === n && 'on')} aria-label={t(`icons.${n}`)} title={t(`icons.${n}`)} onClick={() => pick({ kind: 'icon', name: n })}>
                <Icon name={n as IconName} />
              </button>
            ))
          : emojiShown.map((e) => (
              <button key={e.unicode} type="button" role="option" aria-selected={value?.kind === 'emoji' && value.value === e.unicode} className={cx('icon-opt emoji', value?.kind === 'emoji' && value.value === e.unicode && 'on')} aria-label={e.label} title={e.label} onClick={() => pick({ kind: 'emoji', value: e.unicode })}>
                {e.unicode}
              </button>
            ))}
        {tab === 'emoji' && !emojis && <p className="cap">{t('common.loading')}</p>}
        {((tab === 'icon' && icons.length === 0) || (tab === 'emoji' && emojis && emojiShown.length === 0)) && <p className="cap">{t('iconPicker.none')}</p>}
      </div>
      <div className="sheet-acts">
        <button type="button" className="btn btn-g btn-block" disabled={!value && !photo?.has} onClick={() => pick(null)}>
          {t('iconPicker.remove')}
        </button>
      </div>
    </Sheet>
  );
}

/** Botão que mostra o ícone atual (ou o automático) e abre o seletor. */
export function IconButton({ value, fallback, onChange, label, size }: { value: EntryIcon | null | undefined; fallback: { tags: readonly string[] } | 'item'; onChange: (icon: EntryIcon | null) => void; label: string; size?: 'sm' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={cx('icon-pick', size)} aria-label={label} title={label} onClick={() => setOpen(true)}>
        <EntryIconView icon={value} fallback={fallback} {...(size ? { size } : {})} />
      </button>
      <IconPicker open={open} value={value} onChange={onChange} onClose={() => setOpen(false)} />
    </>
  );
}
