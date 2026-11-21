// Model: legendas — busca o WebVTT no servidor e transforma em uma lista de falas com início e fim.
import { apiFetch } from './api.js';

export async function fetchSubtitle(movieId, subId) {
  const r = await apiFetch(`/api/movies/${movieId}/subtitles/${subId}.vtt`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'erro');
  return parseVtt(await r.text());
}

function parseTime(t) {
  const p = t.trim().replace(',', '.').split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

export function parseVtt(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const body = lines.slice(i + 1).join('\n')
      .replace(/\{\\[^}]*\}/g, '')        // tags ASS
      .replace(/<[^>]+>/g, '')            // tags HTML/VTT
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .trim();
    if (body) cues.push({ start: parseTime(a), end: parseTime(b.trim().split(/\s+/)[0]), text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Texto das falas ativas no instante t */
export const activeCueText = (cues, t) => cues.filter(c => c.start <= t && c.end > t).map(c => c.text).join('\n');
