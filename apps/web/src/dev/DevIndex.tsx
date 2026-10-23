import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DevBar } from './DevBar.tsx';

export default function DevIndex() {
  const { t } = useTranslation();
  return (
    <main className="devpage">
      <DevBar title={t('dev.title')} back={false} />
      <p className="muted">{t('dev.notProduct')}</p>
      <nav className="devnav">
        <Link to="/dev/estilo" className="btn btn-s btn-block">
          {t('dev.styleSheet')}
        </Link>
        <Link to="/dev/paleta" className="btn btn-s btn-block">
          {t('dev.palette')}
        </Link>
      </nav>
    </main>
  );
}
