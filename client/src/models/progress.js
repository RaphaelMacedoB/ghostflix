// Model: progresso de cada filme, guardado no navegador de quem está assistindo.
// Cada pessoa (cada aparelho/navegador) tem o seu próprio progresso, sem precisar de login.
const KEY = 'gf.progress';
const MIN = 15;          // menos que isso: ainda não começou de verdade
const END_MARGIN = 120;  // nos últimos 2 min (créditos), conta como assistido
const bus = new EventTarget();
let version = 0;

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* armazenamento indisponível */ }
  version++;
  bus.dispatchEvent(new Event('change'));
}

/** Para os componentes React acompanharem mudanças (useSyncExternalStore) */
export const subscribeProgress = fn => { bus.addEventListener('change', fn); return () => bus.removeEventListener('change', fn); };
export const progressVersion = () => version;

/** { t: segundos, d: duração, at: quando } ou null */
export function getProgress(id) {
  const p = readAll()[id];
  return p && p.t >= MIN ? p : null;
}

/** Porcentagem assistida (para a barrinha do card), ou 0 */
export function progressPercent(id) {
  const p = getProgress(id);
  return p ? Math.max(2, Math.round(p.t / p.d * 100)) : 0;
}

export function saveProgress(id, t, d) {
  if (!id || !(d > 0) || !Number.isFinite(t)) return;
  const all = readAll();
  const finished = t >= d - Math.min(END_MARGIN, d * 0.05) || t / d > 0.97;
  if (t < MIN || finished) {
    if (!(id in all)) return;
    delete all[id];
  } else {
    const old = all[id];
    if (old && Math.abs(old.t - t) < 1) return; // nada mudou
    all[id] = { t: Math.floor(t), d: Math.round(d), at: Date.now() };
  }
  writeAll(all);
}

export function clearProgress(id) {
  const all = readAll();
  if (id in all) { delete all[id]; writeAll(all); }
}
