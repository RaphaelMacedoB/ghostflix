// Fila de melhoria de imagem: um filme por vez, em segundo plano, com retomada por blocos.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { needsEnhance, targetSize, runEnhance } from './enhance.js';
import { probe } from './media.js';
import { fileExists, safeRm } from '../utils/fs.js';

const fmtRes = v => `${v.width}×${v.height}`;

export class EnhanceQueue {
  constructor(library, { enabled }) {
    this.library = library;
    this.enabled = enabled;
    this.queue = [];
    this.current = null; // { id, kill }
  }

  /** Limpa junções interrompidas (os blocos em <id>.parts ficam para retomar) */
  async prepare() {
    await fsp.mkdir(this.library.enhancedDir, { recursive: true });
    for (const f of await fsp.readdir(this.library.enhancedDir)) {
      if (f.endsWith('.tmp.mp4')) await safeRm(path.join(this.library.enhancedDir, f));
    }
  }

  /** Versão melhorada pronta para tocar, ou null */
  async fileFor(m) {
    const p = this.library.enhancedPath(m.id);
    return m.enhance?.status === 'done' && await fileExists(p) ? p : null;
  }

  /** Decide se o filme precisa ser melhorado (chamado ao detectar/alterar um arquivo) */
  async check(m, stats, { retryErrors = false } = {}) {
    if (!this.enabled || !m.present) return;
    const lib = this.library;
    const abs = lib.absPath(m);
    const st = stats?.mtimeMs ? stats : await fsp.stat(abs);
    const src = `${st.size}:${Math.round(st.mtimeMs)}`;
    let e = m.enhance;
    if (e && e.src !== src) { // arquivo foi trocado: descarta a versão antiga
      if (this.current?.id === m.id) this.current.kill();
      await fsp.rm(lib.enhancedPath(m.id), { force: true });
      await safeRm(lib.partsDir(m.id), { recursive: true });
      e = null;
    }
    if (e?.status === 'running' && this.current?.id === m.id) return; // já está sendo melhorado
    if (e?.status === 'done' && !(await fileExists(lib.enhancedPath(m.id)))) e = null;
    if (e?.status === 'error' && retryErrors) e = null;
    if (e && e.status !== 'queued' && e.status !== 'running') { m.enhance = e; return; }
    if (!e) {
      let info;
      try { info = await probe(abs); } catch (err) { console.error(`[melhoria] não foi possível analisar "${m.title}": ${err.message}`); return; }
      if (!needsEnhance(info.video)) {
        m.enhance = { status: 'skip', src, from: info.video ? fmtRes(info.video) : null };
        lib.save();
        return;
      }
      e = { status: 'queued', progress: 0, src, from: fmtRes(info.video), to: fmtRes(targetSize(info.video)), duration: info.duration };
    }
    m.enhance = { ...e, status: 'queued', progress: 0 };
    if (lib.ready) lib.changed(m); else lib.save();
    if (!this.queue.includes(m.id)) this.queue.push(m.id);
    this.run();
  }

  async run() {
    if (this.current) return;
    const id = this.queue.shift();
    if (!id) return;
    const lib = this.library;
    const m = lib.get(id);
    if (!m?.present || m.enhance?.status !== 'queued') return this.run();
    // Nome temporário único: nunca colide com um arquivo que o Windows ainda esteja segurando
    const out = lib.enhancedPath(id), tmp = path.join(lib.enhancedDir, `${id}.${Date.now().toString(36)}.tmp.mp4`);
    console.log(`[melhoria] iniciando "${m.title}": ${m.enhance.from} → ${m.enhance.to}`);
    const t0 = Date.now();
    m.enhance.status = 'running';
    lib.changed(m);
    let last = 0;
    const job = runEnhance({
      src: lib.absPath(m), workDir: lib.partsDir(id), out: tmp, duration: m.enhance.duration,
      onResume: p => { m.enhance.progress = p; console.log(`[melhoria] retomando "${m.title}" de ${Math.floor(p)}%`); },
      onProgress: p => {
        m.enhance.progress = p;
        if (Date.now() - last > 3000) { last = Date.now(); lib.changed(m); }
      }
    });
    this.current = { id, kill: job.kill };
    try {
      await job.done;
      await fsp.rename(tmp, out);
      await safeRm(lib.partsDir(id), { recursive: true });
      Object.assign(m.enhance, { status: 'done', progress: 100 });
      console.log(`[melhoria] pronto: "${m.title}" (${Math.round((Date.now() - t0) / 60000)} min)`);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      if (err.cancelled) { if (m.enhance?.status === 'running') m.enhance.status = 'queued'; }
      else {
        await safeRm(lib.partsDir(id), { recursive: true });
        m.enhance.status = 'error';
        m.enhance.error = err.message;
        console.error(`[melhoria] erro em "${m.title}": ${err.message}`);
      }
    }
    this.current = null;
    lib.changed(m);
    this.run();
  }

  /** Filme saiu da pasta: cancela e apaga a versão melhorada para liberar espaço */
  async drop(id) {
    const i = this.queue.indexOf(id);
    if (i >= 0) this.queue.splice(i, 1);
    if (this.current?.id === id) this.current.kill();
    const m = this.library.get(id);
    if (m) delete m.enhance;
    await fsp.rm(this.library.enhancedPath(id), { force: true }).catch(() => {});
    await safeRm(this.library.partsDir(id), { recursive: true });
  }

  /** Remove versões melhoradas de filmes que não estão mais na pasta */
  async cleanupOrphans() {
    const files = await fsp.readdir(this.library.enhancedDir).catch(() => []);
    for (const f of files) {
      const m = f.match(/^([0-9a-f]{16})\.(mp4|parts)$/);
      if (m && !this.library.get(m[1])?.present) await this.drop(m[1]);
    }
  }
}
