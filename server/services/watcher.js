// Observa a pasta Filmes e mantém a biblioteca em dia (filmes novos, alterados e removidos).
import chokidar from 'chokidar';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { isVideo } from './titles.js';
import { fileExists } from '../utils/fs.js';

export function watchMovies({ library, covers, enhancer, polling }) {
  const dir = library.moviesDir;

  async function onFile(abs, stats) {
    const size = stats?.size ?? (await fsp.stat(abs)).size;
    const { movie: m, isNew } = library.upsertFile(abs, size);
    if (!(await fileExists(library.coverPath(m.id)))) m.coverStatus = 'pending';
    if (library.ready) {
      if (isNew) console.log(`[+] novo filme: ${m.file}`);
      library.changed(m, isNew ? 'added' : 'updated');
    }
    enhancer.check(m, stats, { retryErrors: !library.ready }).catch(e => console.error('[melhoria]', e.message));
    if (m.coverStatus === 'pending') covers.enqueue(m.id);
    // Ao iniciar, tenta de novo os filmes que ficaram sem capa real (ex.: estava sem internet)
    else if (!library.ready && ['placeholder', 'error'].includes(m.coverStatus)) covers.enqueue(m.id, true);
  }

  function onRemove(abs) {
    const m = library.markRemoved(abs);
    if (!m) return;
    enhancer.drop(m.id); // libera o espaço da versão melhorada
    console.log(`[-] removido: ${m.file}`);
  }

  const watcher = chokidar.watch(dir, {
    ignoreInitial: false,
    persistent: true,
    depth: 10,
    usePolling: polling, // POLLING=1 para pastas de rede/NAS
    interval: 2000,
    // Espera o arquivo terminar de ser copiado antes de adicioná-lo
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 },
    ignored: (p, stats) => stats?.isFile() && !isVideo(p)
  });

  watcher
    .on('add', (p, s) => isVideo(p) && onFile(p, s).catch(e => console.error(e)))
    .on('change', (p, s) => isVideo(p) && onFile(p, s).catch(e => console.error(e)))
    .on('unlink', p => isVideo(p) && onRemove(p))
    .on('unlinkDir', d => {
      for (const m of library.list()) {
        if (library.absPath(m).startsWith(d + path.sep)) onRemove(library.absPath(m));
      }
    })
    .on('ready', () => {
      library.ready = true;
      console.log(`[watch] observando ${dir} — ${library.list().length} filme(s)`);
      setTimeout(() => enhancer.cleanupOrphans(), 15000);
      library.emit('reload', {});
    })
    .on('error', e => console.error('[watch] erro:', e));

  return watcher;
}
