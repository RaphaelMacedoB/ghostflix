// Model: comunicação com o servidor, com troca automática de link público (ngrok ⇄ Cloudflare)
// sem recarregar a página. A página continua aberta pelo link original; só os pedidos de dados e de vídeo
// passam a ir pelo link que está funcionando.

export const headers = { 'ngrok-skip-browser-warning': '1' }; // evita a página de aviso do ngrok nos pedidos
let base = '';             // '' = o próprio endereço da página
let endpoints = [];        // links públicos conhecidos (https://…)
let switching = null;
const bus = new EventTarget();

/** Endereço completo de um caminho do servidor (/api/…, /covers/…, /hls/…) pelo link em uso. */
export const url = path => (path ? base + path : path);
export const currentBase = () => base || location.origin;

/** Troca o endereço de um link absoluto (ex.: pedaço de vídeo do hls.js) para o link em uso. */
export function rebase(u) {
  try {
    const p = new URL(u, location.href);
    return url(p.pathname + p.search);
  } catch { return u; }
}

/** Avisa quando o link em uso muda. Retorna a função para parar de ouvir. */
export function onEndpointChange(fn) {
  bus.addEventListener('change', fn);
  return () => bus.removeEventListener('change', fn);
}

async function alive(origin) {
  try {
    const r = await fetch(origin + '/api/ping', { headers, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return r.ok && !r.headers.get('ngrok-error-code') && (await r.json()).ok === true;
  } catch { return false; }
}

export async function refreshEndpoints() {
  try {
    const r = await fetch(url('/api/endpoints'), { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (Array.isArray(j.endpoints)) endpoints = j.endpoints.map(e => e.url);
  } catch { /* mantém a lista anterior */ }
}

/**
 * Confere se o link em uso responde; se não, passa para outro que responda.
 * Retorna true se trocou de link. Várias chamadas ao mesmo tempo compartilham a mesma verificação.
 */
export function ensureHealthy() {
  switching ||= (async () => {
    if (await alive(currentBase())) return false;
    const candidates = [location.origin, ...endpoints].filter((o, i, a) => o !== currentBase() && a.indexOf(o) === i);
    for (const o of candidates) {
      if (await alive(o)) {
        base = o === location.origin ? '' : o;
        console.info('[ghostflix] link trocado para', currentBase());
        bus.dispatchEvent(new Event('change'));
        refreshEndpoints();
        return true;
      }
    }
    return false;
  })().finally(() => { switching = null; });
  return switching;
}

/** fetch que, se o link em uso falhar, troca de link e tenta de novo uma vez. */
export async function apiFetch(path, opts = {}) {
  const go = () => fetch(url(path), { ...opts, headers: { ...headers, ...opts.headers } });
  try {
    const r = await go();
    if (!r.headers.get('ngrok-error-code') && r.status < 502) return r;
  } catch { /* falha de rede */ }
  await ensureHealthy();
  return go();
}

export async function getJson(path, opts) {
  const r = await apiFetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export const postJson = (path, body, method = 'POST') =>
  getJson(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Descobre os outros links e verifica o atual de tempos em tempos: se o link cair durante o filme,
// a troca acontece antes de o vídeo já carregado acabar, e a pessoa nem percebe.
if (!/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname)) {
  refreshEndpoints();
  setInterval(() => { refreshEndpoints(); ensureHealthy(); }, 20000);
}
