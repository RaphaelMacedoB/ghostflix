// Configuração única do servidor: variáveis de ambiente e flags da linha de comando.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// "npm start -- --tunnel" chega como argumento; "npm start --tunnel" chega como npm_config_tunnel
const flag = name => process.argv.includes('--' + name) || process.env['npm_config_' + name.replace(/-/g, '_')] === 'true';

const dataDir = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const tunnelBoth = flag('tunnel') || process.env.TUNNEL === '1';

export const config = {
  port: Number(process.env.PORT) || 3000,
  moviesDir: path.resolve(process.env.MOVIES_DIR || path.join(ROOT, 'Filmes')),
  dataDir,
  coversDir: path.join(dataDir, 'covers'),
  dbFile: path.join(dataDir, 'library.json'),
  transcodeDir: path.join(dataDir, 'transcode'),
  subsDir: path.join(dataDir, 'subs'),
  enhancedDir: path.join(dataDir, 'enhanced'),
  clientDir: path.join(ROOT, 'client', 'dist'),
  polling: process.env.POLLING === '1',
  enhance: !(flag('no-enhance') || process.env.ENHANCE === '0'),
  tunnels: {
    ngrok: tunnelBoth || flag('ngrok') || process.env.NGROK === '1',
    cloudflare: tunnelBoth || flag('cloudflare') || process.env.CLOUDFLARE === '1'
  },
  // Endereços próprios já existentes (ex.: domínio com a porta aberta no roteador)
  publicUrls: (process.env.PUBLIC_URLS || '').split(',').map(u => u.trim().replace(/\/+$/, '')).filter(Boolean)
};
