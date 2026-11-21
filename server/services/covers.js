import fs from 'node:fs/promises';
import sharp from 'sharp';

// Todas as capas são padronizadas neste tamanho (proporção 2:3 de pôster)
export const COVER_WIDTH = 400;
export const COVER_HEIGHT = 600;

const UA = 'Ghostflix/1.0 (local media catalog)';
const TMDB_KEY = process.env.TMDB_API_KEY || '';

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

async function getBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function score(candidateTitle, candidateYear, title, year) {
  let s = 0;
  const a = norm(candidateTitle), b = norm(title);
  if (a === b) s += 10;
  else if (a.includes(b) || b.includes(a)) s += 5;
  if (year && candidateYear) {
    const d = Math.abs(Number(candidateYear) - year);
    if (d === 0) s += 6; else if (d === 1) s += 3; else s -= 3;
  }
  return s;
}

/* ---------- Fontes de capa ---------- */

// 1) TMDB (opcional, melhor qualidade) – defina TMDB_API_KEY
async function fromTmdb(title, year) {
  if (!TMDB_KEY) return null;
  const q = new URLSearchParams({ api_key: TMDB_KEY, query: title, language: 'pt-BR', include_adult: 'false' });
  if (year) q.set('year', year);
  const data = await getJson(`https://api.themoviedb.org/3/search/movie?${q}`);
  const best = (data.results || [])
    .filter(r => r.poster_path)
    .map(r => ({ r, s: score(r.title, r.release_date?.slice(0, 4), title, year) + score(r.original_title, r.release_date?.slice(0, 4), title, year) / 2 }))
    .sort((x, y) => y.s - x.s)[0];
  if (!best) return null;
  return {
    url: `https://image.tmdb.org/t/p/w780${best.r.poster_path}`,
    source: 'tmdb',
    overview: best.r.overview || '',
    matchedTitle: best.r.title
  };
}

// 2) Sugestões do IMDb (sem chave) – entende títulos traduzidos (ex.: "Interestelar" → "Interstellar")
async function fromImdb(title, year) {
  const q = encodeURIComponent(norm(title).slice(0, 80));
  if (!q) return null;
  const data = await getJson(`https://v3.sg.media-imdb.com/suggestion/x/${q}.json`);
  const movies = (data.d || []).filter(r => r.i?.imageUrl && ['movie', 'tvMovie', 'video'].includes(r.qid));
  if (!movies.length) return null;
  let pick;
  if (year) {
    // Prefere o resultado (na ordem de relevância do IMDb) com o mesmo ano
    pick = movies.find(r => r.y === year) || movies.find(r => Math.abs((r.y || 0) - year) <= 1);
  }
  if (!pick && !year) pick = movies[0];
  if (!pick) pick = movies.find(r => score(r.l, r.y, title, null) >= 5);
  if (!pick) return null;
  return {
    url: pick.i.imageUrl.replace(/\._V1_.*?\.(jpg|jpeg|png)$/i, '._V1_SX800.$1'),
    source: 'imdb',
    overview: '',
    matchedTitle: pick.l,
    matchedYear: pick.y
  };
}

// Resumo do filme pela Wikipédia (pt, depois en)
async function wikiSearch(lang, title, year) {
  const term = `${title} ${year || ''} ${lang === 'pt' ? 'filme' : 'film'}`.trim();
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: term, gsrlimit: '6',
    prop: 'pageimages|extracts', piprop: 'thumbnail', pithumbsize: '800', pilicense: 'any',
    exintro: '1', explaintext: '1', exsentences: '3', exlimit: 'max', origin: '*'
  });
  const data = await getJson(`https://${lang}.wikipedia.org/w/api.php?${q}`);
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
  for (const p of pages) p.extract ||= '';
  const t = norm(title);
  const isFilm = p => /\b(film|filme)\b/.test(norm(p.title)) || /\b(film|filme)\b/.test(norm(p.extract).slice(0, 200));
  const base = p => norm(p.title.replace(/\([^)]*\)/g, ''));
  return pages.find(p => base(p) === t && (isFilm(p) || /\(.*(film|filme).*\)/i.test(p.title)))
    || pages.find(p => norm(p.title).startsWith(t) && isFilm(p) && (!year || norm(p.title + ' ' + p.extract).includes(String(year))))
    || (!year && pages.find(p => norm(p.title).startsWith(t) && isFilm(p)))
    || null;
}

async function fetchOverview(titles, year) {
  for (const lang of ['pt', 'en']) {
    for (const title of [...new Set(titles.filter(Boolean))]) {
      try {
        const p = await wikiSearch(lang, title, year);
        if (p?.extract) return p.extract;
      } catch { /* sem resumo */ }
    }
  }
  return '';
}

// 3) Wikipedia (sem chave) – pôster do artigo do filme
async function fromWikipedia(title, year) {
  for (const lang of ['en', 'pt']) {
    const page = await wikiSearch(lang, title, year);
    const src = page?.thumbnail?.source;
    if (src && !/\.svg/i.test(src)) {
      return { url: src, source: 'wikipedia', overview: page.extract || '', matchedTitle: page.title };
    }
  }
  return null;
}

/* ---------- Placeholder gerado ---------- */

function hashHue(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function wrap(text, max = 14) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

function placeholderSvg(title, year) {
  const hue = hashHue(title);
  const lines = wrap(title.toUpperCase());
  const startY = 330 - (lines.length - 1) * 24;
  const text = lines.map((l, i) =>
    `<text x="200" y="${startY + i * 48}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="800" fill="#f4f1ff" letter-spacing="1">${escapeXml(l)}</text>`
  ).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hue},45%,22%)"/>
        <stop offset="1" stop-color="hsl(${(hue + 60) % 360},40%,8%)"/>
      </linearGradient>
    </defs>
    <rect width="400" height="600" fill="url(#g)"/>
    <g transform="translate(200 150)" fill="#ffffff" opacity="0.14">
      <path d="M-50 40 V-10 A50 50 0 0 1 50 -10 V40 L33 25 L17 40 L0 25 L-17 40 L-33 25 Z"/>
    </g>
    ${text}
    ${year ? `<text x="200" y="${startY + lines.length * 48 + 20}" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#c9c2e8">${year}</text>` : ''}
    <text x="200" y="565" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#a78bfa" letter-spacing="4">GHOSTFLIX</text>
  </svg>`);
}

/* ---------- Padronização ---------- */

async function standardize(input, outFile) {
  await sharp(input)
    .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toFile(outFile);
}

/**
 * Busca uma capa na internet, padroniza para 400x600 WebP e salva em outFile.
 * Sempre gera algo: se nada for encontrado, cria um pôster placeholder.
 */
export async function fetchCover(title, year, outFile) {
  const sources = [fromTmdb, fromImdb, fromWikipedia];
  for (const src of sources) {
    try {
      const found = await src(title, year);
      if (!found) continue;
      const buf = await getBuffer(found.url);
      await standardize(buf, outFile);
      const overview = found.overview || await fetchOverview([title, found.matchedTitle], found.matchedYear || year);
      return { status: 'found', source: found.source, overview, matchedTitle: found.matchedTitle };
    } catch (err) {
      console.warn(`[capa] ${src.name} falhou para "${title}": ${err.message}`);
    }
  }
  await standardize(placeholderSvg(title, year), outFile);
  return { status: 'placeholder', source: 'gerada', overview: '' };
}

export async function fileExists(f) {
  try { await fs.access(f); return true; } catch { return false; }
}
