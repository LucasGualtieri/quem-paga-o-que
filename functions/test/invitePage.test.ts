import { beforeEach, describe, expect, it } from 'vitest';
import { invitePageHtml, invitePreview } from '../src/invitePage.ts';
import { clearFirestore, createSplit, HOST, newUser, PROJECT } from './helpers.ts';

// Link curto do convite: a prévia mostra nome e emoji do split, e a página leva ao app.
beforeEach(clearFirestore);

const APP = 'https://lucasgualtieri.github.io/quem-paga-o-que/';

describe('invitePage', () => {
  it('prévia com nome e emoji do split; abre o convite no app', async () => {
    const lucas = await newUser();
    const { code } = await createSplit(lucas, { name: 'Churras <de> sábado', icon: { kind: 'emoji', value: '🍖' } });
    const res = await fetch(`http://${HOST}:5001/${PROJECT}/us-east1/invitePage/c/${code.toLowerCase()}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<meta property="og:title" content="Churras &#60;de&#62; sábado 🍖">');
    expect(html).toContain('Convite para dividir as contas no Quem Paga O Quê?');
    expect(html).toContain(`url=${APP}#/convite/${code}`);
    expect(html).not.toContain('Lucas');
  });

  it('código inválido, desconhecido ou de split apagado: prévia genérica', async () => {
    expect(await invitePreview('/c/nada')).toEqual({ title: 'Quem Paga O Quê?', description: 'Convite para dividir as contas no Quem Paga O Quê?', target: APP });
    expect((await invitePreview('/c/K7M-24Q')).title).toBe('Quem Paga O Quê?');
    const lucas = await newUser();
    const { splitId, code } = await createSplit(lucas);
    await lucas.call('deleteSplit', { splitId });
    expect(await invitePreview(`/c/${code}`)).toMatchObject({ title: 'Quem Paga O Quê?', target: `${APP}#/convite/${code}` });
    expect(invitePageHtml({ title: 'a"b', description: 'd', target: 'https://x/#/"' })).toContain('content="a&#34;b"');
  });
});
