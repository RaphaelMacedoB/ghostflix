// Monta o servidor HTTP: CORS, API, capas e a interface React já compilada (client/dist).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { apiRoutes } from './routes/index.js';

export function createApp({ config, controllers }) {
  const app = express();

  // Com dois túneis (ngrok e Cloudflare), a página aberta por um link busca dados e vídeo pelo outro se o
  // primeiro cair. Isso é uma requisição entre domínios diferentes, então o servidor precisa liberar (CORS).
  app.use((req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, ngrok-skip-browser-warning',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
      'Access-Control-Max-Age': '86400' // o navegador não pergunta de novo a cada pedaço de vídeo
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json());

  app.use(apiRoutes(controllers));
  app.use('/covers', express.static(config.coversDir, { maxAge: '7d' }));

  // View: a interface React (gerada por "npm run build")
  const index = path.join(config.clientDir, 'index.html');
  app.use(express.static(config.clientDir, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/(api|hls|covers)\/).*/, (_req, res) => {
    if (fs.existsSync(index)) return res.sendFile(index);
    res.status(503).type('text').send('A interface ainda não foi gerada. Rode "npm run build" (ou "npm start", que gera sozinho).');
  });

  return app;
}
