// Modo desenvolvimento: servidor com reinício automático + Vite com atualização instantânea da interface.
// Abra http://localhost:5173 (a API é repassada para o servidor na porta 3000).
import { spawn } from 'node:child_process';

const opts = { stdio: 'inherit', shell: true };
const procs = [
  spawn('node', ['--watch-path=server', 'server/index.js', ...process.argv.slice(2)], opts),
  spawn('npx', ['vite', '--config', 'client/vite.config.js'], opts)
];
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', code => { if (code) stop(); });
