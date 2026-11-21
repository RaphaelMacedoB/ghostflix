import { spawn } from 'node:child_process';
import readline from 'node:readline';

const NGROK = process.env.NGROK_PATH || 'ngrok';

// Procura um túnel do ngrok que já esteja apontando para esta porta (ex.: aberto em outro terminal)
async function existingTunnel(port) {
  for (const apiPort of [4040, 4041, 4042]) {
    try {
      const res = await fetch(`http://127.0.0.1:${apiPort}/api/tunnels`, { signal: AbortSignal.timeout(1500) });
      const { tunnels = [] } = await res.json();
      const t = tunnels.find(t => new RegExp(`(localhost|127\\.0\\.0\\.1):${port}$`).test(t.config?.addr || ''));
      if (t) return t.public_url;
    } catch { /* nenhum agente nessa porta */ }
  }
  return null;
}

/**
 * Abre um túnel público do ngrok para a porta e chama onUrl(url) quando estiver pronto.
 * Retorna uma função que encerra o túnel.
 */
export async function startTunnel(port, { onUrl, onError }) {
  const found = await existingTunnel(port);
  if (found) { onUrl(found, true); return () => {}; }

  const args = ['http', String(port), '--log', 'stdout', '--log-format', 'json'];
  if (process.env.NGROK_DOMAIN) args.push('--url', process.env.NGROK_DOMAIN);

  let proc;
  try {
    proc = spawn(NGROK, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    onError(`não foi possível iniciar o ngrok (${err.message})`);
    return () => {};
  }

  let reported = false;
  let lastError = '';
  proc.on('error', err => {
    reported = true;
    onError(err.code === 'ENOENT' ? 'ngrok não está instalado' : err.message);
  });

  const lines = readline.createInterface({ input: proc.stdout });
  lines.on('line', line => {
    let ev;
    try { ev = JSON.parse(line); } catch { return; }
    if (ev.msg === 'started tunnel' && ev.url && !reported) {
      reported = true;
      onUrl(ev.url, false);
    } else if (ev.err && ev.err !== '<nil>') {
      lastError = String(ev.err);
    }
  });
  proc.stderr.on('data', d => { lastError = String(d).trim() || lastError; });

  proc.on('exit', code => {
    if (stopping) return;
    const msg = (lastError.match(/ERR_NGROK_\d+[^\n]*/) || [lastError])[0].split('\n')[0].slice(0, 300);
    // Ctrl+C fecha o ngrok junto com o Ghostflix: espera um pouco para não avisar "caiu" no encerramento normal
    setTimeout(() => {
      if (!reported) onError(msg || `ngrok saiu (código ${code})`);
      else onError(`o túnel caiu${msg ? ': ' + msg : ''}`);
      reported = true;
    }, 1500).unref();
  });

  let stopping = false;
  const stop = () => { stopping = true; if (proc.exitCode === null) proc.kill(); };
  process.on('exit', stop);
  return stop;
}

/* ---------- Cloudflare Tunnel (rápido, sem conta e sem cota mensal) ---------- */

const CLOUDFLARED_DEFAULTS = [
  'C:/Program Files (x86)/cloudflared/cloudflared.exe',
  'C:/Program Files/cloudflared/cloudflared.exe'
];
async function cloudflaredBin() {
  if (process.env.CLOUDFLARED_PATH) return process.env.CLOUDFLARED_PATH;
  const fs = await import('node:fs');
  // O instalador põe o programa no PATH, mas terminais abertos antes da instalação ainda não enxergam
  return CLOUDFLARED_DEFAULTS.find(p => fs.existsSync(p)) || 'cloudflared';
}

// Um cloudflared que sobrou de uma execução anterior (janela fechada no X) continua rodando à toa: encerra
async function killStaleCloudflared(port) {
  const { execFile } = await import('node:child_process');
  const needle = `127.0.0.1:${port}`;
  const out = await new Promise(r => {
    const cmd = process.platform === 'win32'
      ? ['powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cloudflared.exe' -and $_.CommandLine -and $_.CommandLine.Contains('${needle}') } | ForEach-Object { $_.ProcessId }`]]
      : ['sh', ['-c', `ps -eo pid=,args= | grep cloudflared | grep -F '${needle}' | grep -v grep | awk '{print $1}'`]];
    execFile(cmd[0], cmd[1], { windowsHide: true, timeout: 20000 }, (err, o) => r(err ? '' : o));
  });
  for (const pid of out.split(/\s+/).filter(Boolean).map(Number)) { try { process.kill(pid); } catch { /* já saiu */ } }
}

/**
 * Abre um túnel rápido da Cloudflare (https://xxxx.trycloudflare.com). Se o processo cair, abre outro
 * sozinho (o endereço muda; o navegador de quem assiste descobre o novo pela lista de links).
 */
export async function startCloudflare(port, { onUrl, onError }) {
  const bin = await cloudflaredBin();
  await killStaleCloudflared(port);
  let stopping = false, proc = null, failures = 0;

  const launch = () => {
    let reported = false, lastError = '';
    try {
      proc = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) { onError(`não foi possível iniciar o cloudflared (${err.message})`); return; }
    proc.on('error', err => {
      reported = true; stopping = true;
      onError(err.code === 'ENOENT' ? 'cloudflared não está instalado' : err.message);
    });
    const onLine = line => {
      const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !reported) { reported = true; failures = 0; onUrl(m[0]); }
      else if (/\bERR\b|error/i.test(line)) lastError = line.replace(/^\S+\s+ERR\s+/, '').trim();
    };
    readline.createInterface({ input: proc.stderr }).on('line', onLine);
    readline.createInterface({ input: proc.stdout }).on('line', onLine);
    proc.on('exit', code => {
      if (stopping) return;
      failures++;
      onError(`o túnel caiu${lastError ? ': ' + lastError.slice(0, 200) : ` (código ${code})`}; abrindo outro…`, { retrying: true });
      if (failures <= 5) setTimeout(() => { if (!stopping) launch(); }, Math.min(30000, 2000 * failures)).unref();
    });
  };
  launch();

  const stop = () => { stopping = true; if (proc && proc.exitCode === null) proc.kill(); };
  process.on('exit', stop);
  return stop;
}
