// Links públicos (ngrok, Cloudflare e endereços próprios): abre os túneis, verifica se respondem e mostra no log.
import { startTunnel, startCloudflare } from './tunnel.js';

const NAMES = { ngrok: 'ngrok', cloudflare: 'Cloudflare' };

export class PublicLinks {
  constructor() {
    /** nome -> { name, url, ok, why, checked } */
    this.links = new Map();
  }

  /** Lista para o navegador (os que respondem primeiro) */
  list() {
    return [...this.links.values()].filter(l => l.url).sort((a, b) => b.ok - a.ok)
      .map(({ name, url, ok }) => ({ name, url, ok }));
  }

  start({ port, tunnels, publicUrls }) {
    publicUrls.forEach((u, i) => this.set(`extra${i + 1}`, u));
    if (!tunnels.ngrok && !tunnels.cloudflare && !this.links.size) {
      console.log('  Para criar um link público, inicie com: npm start -- --tunnel\n');
      return;
    }
    if (tunnels.ngrok) {
      console.log('  [ngrok] abrindo link…');
      startTunnel(port, {
        onUrl: (url, reused) => this.set('ngrok', url, reused ? '(túnel do ngrok que já estava aberto)' : ''),
        onError: msg => {
          console.warn(`  [ngrok] link indisponível: ${msg}`);
          if (/authtoken|ERR_NGROK_4018/i.test(msg)) console.warn('  [ngrok] configure o token com "Configurar ngrok.bat"');
          if (/ERR_NGROK_108/.test(msg)) console.warn('  [ngrok] já existe outro ngrok aberto na sua conta; feche-o e reinicie o Ghostflix');
          this.links.delete('ngrok');
        }
      });
    }
    if (tunnels.cloudflare) {
      console.log('  [cloudflare] abrindo link…');
      startCloudflare(port, {
        onUrl: url => this.set('cloudflare', url),
        onError: (msg, { retrying } = {}) => {
          console.warn(`  [cloudflare] ${retrying ? '' : 'link indisponível: '}${msg}`);
          if (/não está instalado/.test(msg)) console.warn('  [cloudflare] instale com: winget install Cloudflare.cloudflared');
          this.links.delete('cloudflare');
        }
      });
    }
    // Verifica de tempos em tempos (ex.: o ngrok grátis bloqueia ao estourar a cota mensal)
    setInterval(() => this.checkAll(), 30_000).unref();
  }

  set(name, url, note = '') {
    this.links.set(name, { name, url, ok: true });
    // O túnel da Cloudflare leva alguns segundos para responder depois de anunciar o endereço
    setTimeout(() => this.check(name).then(() => this.print(note)), name === 'cloudflare' ? 6000 : 500);
  }

  async check(name) {
    const l = this.links.get(name);
    if (!l) return;
    let ok = false, why = '';
    try {
      const r = await fetch(l.url + '/api/ping', { headers: { 'ngrok-skip-browser-warning': '1' }, signal: AbortSignal.timeout(10000) });
      why = r.headers.get('ngrok-error-code') || (r.ok ? '' : 'HTTP ' + r.status);
      ok = r.ok && !why && (await r.json().catch(() => ({}))).ok === true;
    } catch (err) { why = err.name === 'TimeoutError' ? 'sem resposta' : err.message; }
    if (this.links.get(name) !== l) return;
    if (l.checked && ok !== l.ok) {
      if (ok) console.log(`  [${name}] link voltou a funcionar: ${l.url}`);
      else console.warn(`  [${name}] link parou de responder (${why === 'ERR_NGROK_725' ? 'cota de tráfego do ngrok esgotada' : why}). Quem está assistindo passa para o outro link automaticamente.`);
    }
    Object.assign(l, { ok, why, checked: true });
  }

  checkAll() { return Promise.all([...this.links.keys()].map(n => this.check(n))); }

  print(note) {
    const links = [...this.links.values()];
    const best = links.find(l => l.ok) || links[0];
    if (!best) return;
    const lines = links.map(l => `  ${l === best ? '🌐' : '  '} ${((NAMES[l.name] || 'Link') + ':').padEnd(12)}${l.url}` +
      (l.ok ? '' : `  ⚠ não está respondendo${l.why === 'ERR_NGROK_725' ? ' (cota do ngrok esgotada)' : l.why ? ' (' + l.why + ')' : ''}`));
    const bar = '  ' + '─'.repeat(Math.max(...lines.map(l => l.length)) - 1);
    console.log(`\n${bar}\n  Links para compartilhar (envie o marcado com 🌐):\n${lines.join('\n')}\n${bar}`);
    if (links.length > 1) console.log('  Se um link cair, quem já está assistindo continua pelo outro, sem parar o filme.');
    if (!best.ok) console.log('  Nenhum link está respondendo no momento; o Ghostflix continua verificando a cada 30 s.');
    else if (best.name === 'ngrok') console.log('  No primeiro acesso pelo ngrok, a pessoa clica em "Visit Site".');
    if (note) console.log('  ' + note);
    console.log('');
  }
}
