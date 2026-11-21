// Controller: lista de filmes, correção de título e envio do arquivo (streaming direto e download).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
  mpg: 'video/mpeg', mpeg: 'video/mpeg', ts: 'video/mp2t', m2ts: 'video/mp2t', '3gp': 'video/3gpp'
};

export function moviesController({ library, covers }) {
  return {
    list(_req, res) {
      res.json(library.listPublic());
    },

    // Corrigir título/ano e buscar a capa novamente
    update(req, res) {
      const m = library.getPresent(req.params.id);
      if (!m) return res.status(404).json({ error: 'Filme não encontrado' });
      library.rename(m, req.body || {});
      covers.enqueue(m.id, true);
      res.json(library.toPublic(m));
    },

    // Streaming com suporte a Range (permite avançar/voltar o vídeo) e download com ?download=1
    async stream(req, res) {
      const m = library.getPresent(req.params.id);
      if (!m) return res.sendStatus(404);
      const abs = library.absPath(m);
      let stat;
      try { stat = await fsp.stat(abs); } catch { return res.sendStatus(404); }
      if (req.query.download === '1') return res.download(abs, path.basename(abs));

      const type = MIME[m.ext] || 'application/octet-stream';
      const range = req.headers.range;
      if (!range) {
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
        return fs.createReadStream(abs).pipe(res);
      }
      const [s, e] = range.replace(/bytes=/, '').split('-');
      const start = Number(s) || 0;
      const end = e ? Math.min(Number(e), stat.size - 1) : Math.min(start + 8 * 1024 * 1024, stat.size - 1);
      if (start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': type
      });
      fs.createReadStream(abs, { start, end }).pipe(res);
    }
  };
}
