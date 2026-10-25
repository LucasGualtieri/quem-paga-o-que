import { onRequest } from 'firebase-functions/v2/https';
import { parseInvite, splitCover } from '@qpq/shared';
import { db, REGION, type SplitData } from './common.ts';

/**
 * Página do link curto do convite (`/c/ABC-123`, servida pelo Firebase Hosting). Quem monta a
 * prévia (WhatsApp, iMessage…) não roda o app nem vê o que vem depois do `#`, então esta página
 * já traz o nome e o emoji do split nas tags Open Graph e leva a pessoa ao convite no app.
 * Só nome e emoji: sem nomes de pessoas nem valores.
 */

/** Onde o app está publicado (GitHub Pages). Produção pode trocar com APP_URL. */
const APP_URL = process.env.APP_URL ?? 'https://lucasgualtieri.github.io/quem-paga-o-que/';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface InvitePreview {
  title: string;
  description: string;
  target: string;
}

/** O que a prévia mostra; split apagado ou código inválido ficam com o texto genérico. */
export async function invitePreview(path: string): Promise<InvitePreview> {
  const code = parseInvite(path);
  const target = code ? `${APP_URL}#/convite/${code}` : APP_URL;
  const generic = { title: 'Quem Paga O Quê?', description: 'Convite para dividir as contas no Quem Paga O Quê?', target };
  if (!code) return generic;
  const invite = await db().doc(`inviteCodes/${code}`).get();
  if (!invite.exists || invite.get('gone')) return generic;
  const split = (await db().doc(`splits/${invite.get('splitId') as string}`).get()).data() as SplitData | undefined;
  if (!split) return generic;
  const cover = splitCover(split);
  const emoji = cover.kind === 'emoji' ? cover.value : '';
  return { title: emoji ? `${split.name} ${emoji}` : split.name, description: generic.description, target };
}

export function invitePageHtml(p: InvitePreview): string {
  const t = escape(p.title);
  const d = escape(p.description);
  const u = escape(p.target);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:site_name" content="Quem Paga O Quê?">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta http-equiv="refresh" content="0;url=${u}">
</head>
<body>
<p><a href="${u}">Abrir o convite</a></p>
<script>location.replace(${JSON.stringify(p.target)});</script>
</body>
</html>`;
}

export const invitePage = onRequest({ region: REGION, maxInstances: 10, invoker: 'public' }, async (req, res) => {
  const preview = await invitePreview(req.path);
  res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).type('html').send(invitePageHtml(preview));
});
