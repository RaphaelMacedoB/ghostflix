// Fila de busca de capas: uma por vez, para não sobrecarregar as APIs de imagens.
import { fetchCover } from './covers.js';
import { fileExists } from '../utils/fs.js';

export class CoverQueue {
  constructor(library) {
    this.library = library;
    this.queue = [];
    this.working = false;
  }

  enqueue(id, force = false) {
    const existing = this.queue.find(q => q.id === id);
    if (existing) existing.force ||= force;
    else this.queue.push({ id, force });
    this.run();
  }

  async run() {
    if (this.working) return;
    this.working = true;
    const lib = this.library;
    while (this.queue.length) {
      const { id, force } = this.queue.shift();
      const m = lib.get(id);
      if (!m) continue;
      if (!force && m.coverStatus !== 'pending' && await fileExists(lib.coverPath(id))) continue;
      console.log(`[capa] buscando: "${m.title}"${m.year ? ` (${m.year})` : ''}`);
      try {
        const r = await fetchCover(m.title, m.year, lib.coverPath(id));
        Object.assign(m, { coverStatus: r.status, coverSource: r.source, overview: r.overview || '', coverVersion: Date.now().toString(36) });
        console.log(`[capa] ${r.status === 'found' ? 'encontrada via ' + r.source : 'placeholder gerado'}: "${m.title}"`);
      } catch (err) {
        console.error(`[capa] erro em "${m.title}":`, err.message);
        m.coverStatus = 'error';
      }
      lib.changed(m);
    }
    this.working = false;
  }
}
