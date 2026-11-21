// Model: a biblioteca de filmes (persistida em data/library.json).
// Guarda os dados de cada filme e avisa quem estiver ouvindo quando algo muda.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseTitle } from '../services/titles.js';

export class Library extends EventEmitter {
  constructor({ dbFile, moviesDir, coversDir, enhancedDir }) {
    super();
    Object.assign(this, { dbFile, moviesDir, coversDir, enhancedDir });
    /** @type {Map<string, any>} id -> filme */
    this.movies = new Map();
    this.ready = false; // vira true depois da primeira varredura da pasta
    this.saveTimer = null;
  }

  async load() {
    try {
      const saved = JSON.parse(await fsp.readFile(this.dbFile, 'utf8'));
      for (const m of saved) this.movies.set(m.id, { ...m, present: false });
    } catch { /* primeira execução */ }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      fsp.writeFile(this.dbFile, JSON.stringify([...this.movies.values()], null, 2))
        .catch(e => console.error('Erro salvando biblioteca:', e));
    }, 300);
  }

  /* ---------- Consultas ---------- */

  get(id) { return this.movies.get(id); }
  getPresent(id) { const m = this.movies.get(id); return m?.present ? m : null; }
  list() { return [...this.movies.values()].filter(m => m.present); }
  idFor(rel) { return crypto.createHash('sha1').update(rel.toLowerCase()).digest('hex').slice(0, 16); }
  relPath(abs) { return path.relative(this.moviesDir, abs); }
  absPath(m) { return path.join(this.moviesDir, m.file); }
  coverPath(id) { return path.join(this.coversDir, `${id}.webp`); }
  enhancedPath(id) { return path.join(this.enhancedDir, `${id}.mp4`); }
  partsDir(id) { return path.join(this.enhancedDir, `${id}.parts`); } // blocos de 5 min, permitem retomar

  /** Formato enviado ao navegador */
  toPublic(m) {
    return {
      id: m.id,
      title: m.title,
      year: m.year,
      file: m.file,
      ext: m.ext,
      size: m.size,
      addedAt: m.addedAt,
      overview: m.overview || '',
      coverStatus: m.coverStatus,
      coverSource: m.coverSource || null,
      enhance: m.enhance ? { status: m.enhance.status, progress: Math.floor(m.enhance.progress || 0), from: m.enhance.from, to: m.enhance.to } : null,
      cover: m.coverStatus === 'pending' ? null : `/covers/${m.id}.webp?v=${m.coverVersion || 0}`
    };
  }
  listPublic() { return this.list().map(m => this.toPublic(m)).sort((a, b) => b.addedAt - a.addedAt); }

  /* ---------- Alterações ---------- */

  /** Arquivo encontrado (novo ou alterado) na pasta Filmes */
  upsertFile(abs, size) {
    const rel = this.relPath(abs);
    const id = this.idFor(rel);
    let m = this.movies.get(id);
    const isNew = !m;
    if (!m) {
      const { title, year } = parseTitle(abs);
      m = { id, title, year, addedAt: Date.now(), coverStatus: 'pending', overview: '' };
      this.movies.set(id, m);
    }
    Object.assign(m, { file: rel, ext: path.extname(abs).slice(1).toLowerCase(), size, present: true });
    this.save();
    return { movie: m, isNew };
  }

  /** Arquivo removido da pasta Filmes */
  markRemoved(abs) {
    const m = this.movies.get(this.idFor(this.relPath(abs)));
    if (!m) return null;
    m.present = false;
    this.save();
    this.emit('removed', { id: m.id });
    return m;
  }

  /** Corrige título/ano (vindo do formulário "Corrigir título") */
  rename(m, { title, year }) {
    if (typeof title === 'string' && title.trim()) m.title = title.trim().slice(0, 200);
    if (year === null || year === '') m.year = null;
    else if (Number.isInteger(Number(year)) && Number(year) > 1880 && Number(year) < 2100) m.year = Number(year);
    m.coverStatus = 'pending';
    this.changed(m);
  }

  /** Salva e avisa os navegadores que o filme mudou */
  changed(m, event = 'updated') {
    this.save();
    if (m.present) this.emit(event, this.toPublic(m));
  }
}
