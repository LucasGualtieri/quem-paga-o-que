import { useEffect, useRef } from 'react';
import { saveProfile, useProfile } from '../data/hooks.ts';
import { useSession } from '../data/session.ts';
import { setLang, useLang } from '../i18n/index.ts';
import { setTheme, useTheme } from '../theme/theme.ts';

/**
 * Tema e idioma são preferências do usuário e valem em todos os aparelhos (spec 08):
 * o que está salvo na conta é aplicado ao entrar; mudar aqui grava na conta.
 */
export function PrefsSync() {
  // Só começa a ouvir o Firebase nas telas do produto (as de revisão não precisam dele).
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const profile = useProfile(uid);
  const theme = useTheme();
  const lang = useLang();
  const known = useRef<{ uid: string; theme: string; lang: string } | null>(null);

  const server = profile.status === 'ready' ? profile.data.prefs : null;
  const loaded = server !== null;

  // Conta → aparelho.
  useEffect(() => {
    if (!uid || !server) return;
    const next = { uid, theme: server.theme ?? theme, lang: server.lang ?? lang };
    known.current = next;
    if (next.theme !== theme) setTheme(next.theme as 'light' | 'dark');
    if (next.lang !== lang) void setLang(next.lang as 'pt-BR' | 'en');
    // Conta ainda sem tema/idioma: guarda o que este aparelho já usa.
    if (server.theme === undefined || server.lang === undefined) void saveProfile(uid, { prefs: { theme: next.theme, lang: next.lang } }).catch(() => {});
    // `loaded` entra nas dependências: um perfil vazio carregado não muda tema nem idioma (ambos undefined).
  }, [uid, loaded, server?.theme, server?.lang]);

  // Aparelho → conta (só mudanças feitas aqui).
  useEffect(() => {
    const k = known.current;
    if (!uid || !k || k.uid !== uid || (k.theme === theme && k.lang === lang)) return;
    known.current = { uid, theme, lang };
    void saveProfile(uid, { prefs: { theme, lang } }).catch(() => {});
  }, [uid, theme, lang]);

  return null;
}
