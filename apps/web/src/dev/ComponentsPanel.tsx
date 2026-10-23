import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SplitMode } from '@qpq/calc';
import {
  AvatarToggle,
  Badge,
  Button,
  Card,
  Chip,
  Icon,
  ListItem,
  PersonRow,
  Segmented,
  SplitCard,
  Stepper,
  Switch,
  TextField,
  ToastView,
  Avatar,
} from '../components/index.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';

/** Os componentes da Folha de estilo (reference/design/Estilo.dc.html, seção 05), interativos. */
export function ComponentsPanel() {
  const { t } = useTranslation();
  const lang = useLang();
  const fmt = (c: number, signed = false) => formatCents(c, lang, { signed });
  const [payer, setPayer] = useState<'me' | 'bia'>('me');
  const [tags, setTags] = useState({ food: true, drinks: false });
  const [with_, setWith] = useState({ me: true, fel: false });
  const [eaters, setEaters] = useState({ me: true, bia: true, fel: false });
  const [toggles, setToggles] = useState({ a: true, b: false });
  const [mode, setMode] = useState<SplitMode>('frac');
  const [parts, setParts] = useState(3);
  const s = (k: string) => t(`dev.sections.${k}`);
  const x = (k: string) => t(`dev.samples.${k}`);

  return (
    <div className="cpanel">
      <div>
        <p className="lab">{s('buttons')}</p>
        <div className="row-wrap">
          <Button icon={<Icon name="plus" />}>{x('newSplit')}</Button>
          <Button variant="secondary">{x('secondary')}</Button>
          <Button variant="ghost">{x('ghost')}</Button>
          <Button variant="danger">{x('delete')}</Button>
          <Button disabled>{x('disabled')}</Button>
        </div>
      </div>

      <div className="grid3">
        <TextField label={s('input')} placeholder={x('placeholder')} />
        <TextField label={s('focus')} defaultValue={x('focusValue')} className="is-focus" />
        <TextField label={s('error')} error={x('nameRequired')} />
      </div>

      <div>
        <p className="lab">{s('chips')}</p>
        <div className="row-wrap">
          <Chip pressed={payer === 'me'} onClick={() => setPayer('me')} avatar={<Avatar name="Lucas" color={1} />}>
            {t('common.you')}
          </Chip>
          <Chip pressed={payer === 'bia'} onClick={() => setPayer('bia')} avatar={<Avatar name="Beatriz" color={2} />}>
            Beatriz
          </Chip>
          <Chip pressed={tags.food} onClick={() => setTags({ ...tags, food: !tags.food })}>
            {x('tagFood')}
          </Chip>
          <Chip pressed={tags.drinks} onClick={() => setTags({ ...tags, drinks: !tags.drinks })}>
            {x('tagDrinks')}
          </Chip>
        </div>
      </div>

      <div className="grid-people">
        <div>
          <p className="lab">{s('people')}</p>
          <Card className="plist">
            <PersonRow name={t('common.you')} avatarName="Lucas" color={1} me selected={with_.me} trailing={with_.me ? fmt(3000) : '—'} onClick={() => setWith({ ...with_, me: !with_.me })} />
            <PersonRow
              name="Fellipe"
              color={4}
              selected={with_.fel}
              {...(with_.fel ? {} : { caption: t('tx.outOfExpense') })}
              trailing={with_.fel ? fmt(3000) : '—'}
              onClick={() => setWith({ ...with_, fel: !with_.fel })}
            />
          </Card>
        </div>
        <div>
          <p className="lab">{s('itemAvatars')}</p>
          <div className="row-tight">
            <AvatarToggle all name={t('common.all')} color={1} selected={eaters.me && eaters.bia && eaters.fel} onClick={() => setEaters({ me: true, bia: true, fel: true })} />
            <AvatarToggle name={t('common.you')} avatarName="Lucas" color={1} me selected={eaters.me} onClick={() => setEaters({ ...eaters, me: !eaters.me })} />
            <AvatarToggle name="Beatriz" color={2} selected={eaters.bia} onClick={() => setEaters({ ...eaters, bia: !eaters.bia })} />
            <AvatarToggle name="Fellipe" color={4} selected={eaters.fel} onClick={() => setEaters({ ...eaters, fel: !eaters.fel })} />
          </div>
          <p className="lab lab-gap">{s('switch')}</p>
          <div className="row-wrap">
            <Switch label={`${s('switch')} 1`} checked={toggles.a} onChange={(a) => setToggles({ ...toggles, a })} />
            <Switch label={`${s('switch')} 2`} checked={toggles.b} onChange={(b) => setToggles({ ...toggles, b })} />
          </div>
        </div>
      </div>

      <div className="grid-seg">
        <div>
          <p className="lab">{s('splitPicker')}</p>
          <Segmented<SplitMode>
            label={s('splitPicker')}
            value={mode}
            onChange={setMode}
            options={(['equal', 'frac', 'pct', 'exact'] as const).map((m) => ({ value: m, label: t(`modes.${m}`) }))}
          />
        </div>
        <div>
          <p className="lab">{s('stepper')}</p>
          <Stepper value={parts} min={0} onChange={setParts} />
        </div>
      </div>

      <div>
        <p className="lab">{s('status')}</p>
        <div className="row-wrap">
          <Badge tone="pos" icon="in">
            {fmt(12000, true)}
          </Badge>
          <Badge tone="neg" icon="out">
            {fmt(-9213)}
          </Badge>
          <Badge tone="zero" icon="check">
            {t('status.settled')}
          </Badge>
          <Badge tone="neg" icon="clock">
            {t('status.pending')}
          </Badge>
          <Badge tone="zero" icon="check">
            {t('status.paid')}
          </Badge>
          <Badge tone="acc">{t('status.admin')}</Badge>
        </div>
      </div>

      <div className="grid2">
        <div>
          <p className="lab">{s('splitCard')}</p>
          <SplitCard
            emoji="🎆"
            color={1}
            name={x('splitName')}
            meta={`${t('split.people', { count: 4 })} · ${t('split.open')}`}
            balance={
              <Badge tone="neg" icon="out">
                {fmt(-9213)}
              </Badge>
            }
          />
        </div>
        <div>
          <p className="lab">{s('listItem')}</p>
          <ListItem
            icon={<Icon name="food" />}
            title={x('bakery')}
            caption={t('tx.paidBy', { name: 'Catarina' })}
            amount={fmt(4200)}
            mine={<span className="mine amt neg">{t('tx.yourShare', { amount: fmt(-1050) })}</span>}
          />
        </div>
      </div>

      <div>
        <p className="lab">{s('toast')}</p>
        <ToastView text={x('expenseAdded')} onUndo={() => {}} />
      </div>
    </div>
  );
}
