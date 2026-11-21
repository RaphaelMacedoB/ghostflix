// Controller: a lista de filmes em tempo real.
// Usa Server-Sent Events quando o link permite; senão (ex.: túnel da Cloudflare), verifica a cada 10 s.
import { Store } from './Store.js';
import { toasts } from './ToastController.js';
import { fetchMovies, renameMovie } from '../models/movies.js';
import { url, ensureHealthy, onEndpointChange } from '../models/api.js';

class LibraryController extends Store {
  constructor() {
    super({ movies: [], loaded: false, live: { on: false, text: 'Conectando…' } });
    this.es = null;
    this.pollTimer = null;
    this.helloTimer = null;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.load().catch(() => {});
    this.connect();
    onEndpointChange(() => this.connect()); // trocou de link: reconecta pelo novo
  }

  async load() {
    const movies = await fetchMovies();
    this.set({ movies, loaded: true });
  }

  setLive(on, text) { this.set({ live: { on, text } }); }

  /* ---------- Tempo real ---------- */

  connect() {
    this.es?.close();
    clearTimeout(this.helloTimer);
    const es = this.es = new EventSource(url('/api/events'));
    let hello = false;
    // Alguns links seguram os eventos: sem o "hello" em 8 s, passa a verificar periodicamente
    this.helloTimer = setTimeout(() => { if (!hello) this.startPolling(); }, 8000);
    es.addEventListener('hello', () => { hello = true; this.stopPolling(); this.setLive(true, 'Ao vivo'); this.load().catch(() => {}); });
    es.onerror = () => {
      if (hello) this.setLive(false, 'Reconectando…');
      else if (!this.pollTimer) this.startPolling();
      ensureHealthy();
    };
    es.addEventListener('added', e => { const m = JSON.parse(e.data); this.upsert(m); toasts.show('Novo filme adicionado', m.title); });
    es.addEventListener('updated', e => this.onUpdated(JSON.parse(e.data)));
    es.addEventListener('removed', e => this.remove(JSON.parse(e.data).id));
    es.addEventListener('reload', () => this.load().catch(() => {}));
  }

  startPolling() {
    this.es?.close();
    this.stopPolling();
    this.setLive(true, 'Conectado');
    const tick = async () => {
      try {
        const list = await fetchMovies();
        const { movies } = this.state;
        if (!movies.length) { this.set({ movies: list, loaded: true }); return this.setLive(true, 'Conectado'); }
        const known = new Map(movies.map(m => [m.id, m]));
        for (const m of list) {
          const old = known.get(m.id);
          if (!old) { this.upsert(m); toasts.show('Novo filme adicionado', m.title); }
          else if (JSON.stringify(old) !== JSON.stringify(m)) this.onUpdated(m);
        }
        const ids = new Set(list.map(m => m.id));
        for (const m of movies) if (!ids.has(m.id)) this.remove(m.id);
        this.setLive(true, 'Conectado');
      } catch { this.setLive(false, 'Reconectando…'); }
    };
    tick();
    this.pollTimer = setInterval(tick, 10000);
  }

  stopPolling() { clearInterval(this.pollTimer); this.pollTimer = null; }

  /* ---------- Alterações na lista ---------- */

  upsert(movie) {
    this.set(s => {
      const i = s.movies.findIndex(m => m.id === movie.id);
      const movies = [...s.movies];
      if (i >= 0) movies[i] = movie; else movies.unshift(movie);
      return { movies };
    });
  }

  remove(id) { this.set(s => ({ movies: s.movies.filter(m => m.id !== id) })); }

  onUpdated(m) {
    const prev = this.state.movies.find(x => x.id === m.id);
    this.upsert(m);
    if (prev?.enhance?.status === 'running' && m.enhance?.status === 'done') toasts.show('Imagem melhorada', `${m.title} agora em ${m.enhance.to}`, url(m.cover));
    if (prev && prev.cover == null && m.coverStatus === 'found') toasts.show('Capa encontrada', m.title, url(m.cover));
  }

  /** Corrige título/ano e pede uma nova busca de capa */
  async rename(id, title, year) {
    const m = await renameMovie(id, { title, year });
    this.upsert(m);
    toasts.show('Buscando nova capa…', title);
  }
}

export const library = new LibraryController();
