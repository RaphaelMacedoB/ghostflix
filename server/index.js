// Ponto de entrada do Ghostflix: prepara as pastas, liga models, services e controllers e sobe o servidor.
import fsp from 'node:fs/promises';
import os from 'node:os';
import { config } from './config.js';
import { createApp } from './app.js';
import { Library } from './models/Library.js';
import { EventHub } from './services/events.js';
import { CoverQueue } from './services/coverQueue.js';
import { EnhanceQueue } from './services/enhanceQueue.js';
import { PublicLinks } from './services/links.js';
import { watchMovies } from './services/watcher.js';
import { killOrphanFfmpeg } from './services/enhance.js';
import { ffmpegAvailable, detectEncoder, stopAllSessions } from './services/media.js';
import { moviesController } from './controllers/moviesController.js';
import { playbackController } from './controllers/playbackController.js';
import { systemController } from './controllers/systemController.js';
import { safeRm } from './utils/fs.js';

/* ---------- Pastas e restos de execuções anteriores ---------- */

await fsp.mkdir(config.coversDir, { recursive: true });
await fsp.mkdir(config.moviesDir, { recursive: true });
const orphans = await killOrphanFfmpeg(config.dataDir);
if (orphans) console.log(`[ffmpeg] ${orphans} processo(s) da execução anterior encerrado(s)`);
await safeRm(config.transcodeDir, { recursive: true });
await fsp.mkdir(config.transcodeDir, { recursive: true });

const hasFfmpeg = await ffmpegAvailable();
if (hasFfmpeg) detectEncoder().then(e => console.log(`[ffmpeg] encoder de vídeo: ${e}`));
else console.warn('[ffmpeg] não encontrado: formatos não suportados pelo navegador não poderão ser convertidos');

/* ---------- Models e services ---------- */

const library = new Library(config);
await library.load();
const events = new EventHub().watch(library);
const covers = new CoverQueue(library);
const enhancer = new EnhanceQueue(library, { enabled: hasFfmpeg && config.enhance });
await enhancer.prepare();
if (!config.enhance) console.log('[melhoria] desativada (--no-enhance / ENHANCE=0)');
const links = new PublicLinks();
watchMovies({ library, covers, enhancer, polling: config.polling });

/* ---------- Controllers e servidor ---------- */

const app = createApp({
  config,
  controllers: {
    movies: moviesController({ library, covers }),
    playback: playbackController({ library, enhancer, hasFfmpeg, transcodeDir: config.transcodeDir, subsDir: config.subsDir }),
    system: systemController({ events, links })
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await stopAllSessions(); process.exit(0); });
}

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`\n  👻 Ghostflix rodando`);
  console.log(`  Local:   http://localhost:${config.port}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  Rede:    http://${n.address}:${config.port}`);
    }
  }
  console.log(`  Pasta:   ${config.moviesDir}\n`);
  links.start(config);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${config.port} já está em uso: o Ghostflix provavelmente já está aberto em outra janela.\n`);
    process.exit(1);
  }
  throw err;
});
