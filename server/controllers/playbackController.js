// Controller: reprodução — faixas de áudio/legendas, legendas em WebVTT e conversão ao vivo (HLS via ffmpeg).
import path from 'node:path';
import { probe, subtitleVtt, startSession, stopSession, touchSession } from '../services/media.js';

export function playbackController({ library, enhancer, hasFfmpeg, transcodeDir, subsDir }) {
  // Filme pedido na URL, ou responde 404
  function movieOr404(req, res) {
    const m = library.getPresent(req.params.id);
    if (!m) { res.status(404).json({ error: 'Filme não encontrado' }); return null; }
    return { m, abs: library.absPath(m) };
  }

  return {
    async media(req, res) {
      const f = movieOr404(req, res); if (!f) return;
      if (!hasFfmpeg) return res.json({ ffmpeg: false, mode: 'direct', audio: [], subtitles: [], duration: 0 });
      try {
        const info = await probe(f.abs);
        const enhanced = await enhancer.fileFor(f.m);
        // Com a versão melhorada, o vídeo vem dela (sem recodificar) e o áudio do original
        res.json({ ffmpeg: true, ...info, ...(enhanced ? { mode: 'hls', copyVideo: true, enhanced: f.m.enhance.to } : {}) });
      } catch (err) {
        res.status(500).json({ error: 'Não foi possível analisar o arquivo: ' + err.message });
      }
    },

    async subtitle(req, res) {
      const f = movieOr404(req, res); if (!f) return;
      try {
        const info = await probe(f.abs);
        const file = await subtitleVtt(f.abs, info, req.params.sub, subsDir);
        res.type('text/vtt; charset=utf-8').sendFile(file);
      } catch (err) {
        res.status(422).json({ error: err.message });
      }
    },

    // Inicia uma conversão para HLS a partir de "start" segundos com a faixa de áudio escolhida
    async play(req, res) {
      const f = movieOr404(req, res); if (!f) return;
      if (!hasFfmpeg) return res.status(501).json({ error: 'ffmpeg não está instalado' });
      const { audio = 0, start = 0, previous } = req.body || {};
      if (typeof previous === 'string') stopSession(previous);
      try {
        const info = await probe(f.abs);
        const s = Math.max(0, Math.min(Number(start) || 0, Math.max(0, info.duration - 5)));
        const session = await startSession({
          abs: f.abs, videoAbs: await enhancer.fileFor(f.m), info, audio: Number(audio) || 0, start: s, workDir: transcodeDir
        });
        console.log(`[play] "${f.m.title}" a partir de ${Math.round(s)}s, áudio ${audio}, vídeo: ${session.encoder}`);
        res.json({ session: session.id, url: `/hls/${session.id}/index.m3u8`, start: s });
      } catch (err) {
        console.error('[play]', err.message);
        res.status(500).json({ error: err.message });
      }
    },

    stop(req, res) {
      stopSession(req.params.sid);
      res.sendStatus(204);
    },

    hlsFile(req, res) {
      const { sid, file } = req.params;
      if (!/^[a-f0-9]{16}$/.test(sid) || !/^(index\.m3u8|seg\d{5}\.ts)$/.test(file)) return res.sendStatus(400);
      if (!touchSession(sid)) return res.sendStatus(404);
      res.set('Cache-Control', 'no-cache');
      res.type(file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
      res.sendFile(path.join(transcodeDir, sid, file), err => { if (err && !res.headersSent) res.sendStatus(404); });
    }
  };
}
