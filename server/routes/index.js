// Rotas: liga cada endereço da API ao seu controller.
import { Router } from 'express';

export function apiRoutes({ movies, playback, system }) {
  const r = Router();

  r.get('/api/ping', system.ping);
  r.get('/api/endpoints', system.endpoints);
  r.get('/api/events', system.events);

  r.get('/api/movies', movies.list);
  r.patch('/api/movies/:id', movies.update);
  r.get('/api/stream/:id', movies.stream);

  r.get('/api/movies/:id/media', playback.media);
  r.get('/api/movies/:id/subtitles/:sub.vtt', playback.subtitle);
  r.post('/api/movies/:id/play', playback.play);
  r.post('/api/sessions/:sid/stop', playback.stop);
  r.get('/hls/:sid/:file', playback.hlsFile);

  return r;
}
