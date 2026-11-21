// Gera a interface (client/dist) antes de iniciar, só quando algo em client/ mudou desde a última vez.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'client');
const built = path.join(client, 'dist', 'index.html');

function newest(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'dist' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}

const builtAt = fs.existsSync(built) ? fs.statSync(built).mtimeMs : 0;
if (builtAt && builtAt >= newest(client)) process.exit(0);

console.log('Gerando a interface (React)…');
try {
  execSync('npx vite build --config client/vite.config.js --logLevel warn', { cwd: root, stdio: 'inherit' });
} catch {
  console.error('\nNão foi possível gerar a interface. Rode "npm install" e tente de novo.');
  process.exit(1);
}
