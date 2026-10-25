// Teste à mão no computador e no celular (mesma rede Wi-Fi), só com os emuladores:
// sobe os emuladores aceitando conexões da rede local, o app com --host e o split de exemplo.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const ip = Object.values(networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address ?? 'localhost';

// Uma cópia do firebase.json com os emuladores em 0.0.0.0 (só para este modo; fica fora do git).
const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
for (const k of ['auth', 'firestore', 'storage', 'functions', 'ui']) config.emulators[k] = { ...config.emulators[k], host: '0.0.0.0' };
writeFileSync('.firebase.lan.json', JSON.stringify(config, null, 2));

const children = [];
const run = (cmd, args) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: false });
  children.push(p);
  return p;
};
const stop = () => {
  for (const p of children) p.kill('SIGINT');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await new Promise((ok, fail) => run('npm', ['run', 'bundle', '-w', '@qpq/functions']).on('exit', (c) => (c === 0 ? ok() : fail(new Error('bundle')))));
run('npx', ['firebase', 'emulators:start', '--project', 'demo-qpq', '--config', '.firebase.lan.json']);

// Espera as Functions responderem para criar o split de exemplo.
for (let i = 0; i < 120; i++) {
  // 404 = as Functions ainda estão carregando; 401 = no ar (pediu login).
  const up = await fetch('http://127.0.0.1:5001/demo-qpq/us-east1/createSplit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"data":{}}' }).then(
    (r) => r.status !== 404,
    () => false,
  );
  if (up) break;
  await new Promise((r) => setTimeout(r, 1000));
}
run('npm', ['run', 'dev', '-w', '@qpq/web', '--', '--host']);
run('node', ['scripts/seed-local.mjs', ip]);
