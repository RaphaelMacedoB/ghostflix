// Model: filmes — acesso à API e regras de busca, filtro, ordenação e formatação.
import { getJson, postJson } from './api.js';

export const fetchMovies = () => getJson('/api/movies');
export const renameMovie = (id, { title, year }) => postJson(`/api/movies/${id}`, { title, year }, 'PATCH');
export const fetchMedia = id => getJson(`/api/movies/${id}/media`);
export const streamPath = id => `/api/stream/${id}`;
export const downloadPath = id => `/api/stream/${id}?download=1`;

export const SORTS = [
  ['recent', 'Mais recentes'],
  ['az', 'A → Z'],
  ['za', 'Z → A'],
  ['year-desc', 'Ano (novo → antigo)'],
  ['year-asc', 'Ano (antigo → novo)'],
  ['size', 'Tamanho']
];

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const byTitle = (a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
const sorters = {
  recent: (a, b) => b.addedAt - a.addedAt,
  az: byTitle,
  za: (a, b) => byTitle(b, a),
  'year-desc': (a, b) => (b.year || 0) - (a.year || 0) || byTitle(a, b),
  'year-asc': (a, b) => (a.year || 9999) - (b.year || 9999) || byTitle(a, b),
  size: (a, b) => b.size - a.size
};

/** Busca sem acentos, filtros de década e formato, e ordenação */
export function filterMovies(movies, { query = '', sort = 'recent', decade = '', format = '' }) {
  const q = norm(query).trim();
  return movies.filter(m => {
    if (q && !norm(`${m.title} ${m.year || ''} ${m.file}`).includes(q)) return false;
    if (decade && !(m.year >= +decade && m.year < +decade + 10)) return false;
    if (format && m.ext !== format) return false;
    return true;
  }).sort(sorters[sort] || sorters.recent);
}

export const decadeOptions = movies =>
  [...new Set(movies.filter(m => m.year).map(m => Math.floor(m.year / 10) * 10))].sort((a, b) => b - a)
    .map(d => [String(d), `Anos ${String(d).slice(-2)} (${d})`]);

export const formatOptions = movies => [...new Set(movies.map(m => m.ext))].sort().map(f => [f, f.toUpperCase()]);

export const latestMovie = movies => [...movies].sort((a, b) => b.addedAt - a.addedAt)[0] || null;

export const fmtSize = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(0) + ' MB';

/** 1:05:09 ou 5:09 */
export function fmtClock(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** 1h05 ou 5 min */
export function fmtShort(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

export function enhanceText(e) {
  return {
    queued: `Na fila para melhorar a imagem (${e?.from} → ${e?.to})`,
    running: `Melhorando a imagem… ${e?.progress}% (${e?.from} → ${e?.to})`,
    done: `✨ Imagem melhorada: ${e?.from} → ${e?.to}`,
    error: 'Não foi possível melhorar a imagem deste filme'
  }[e?.status] || '';
}
