// Controller: o player de vídeo.
// Reprodução direta ou convertida (HLS via ffmpeg), troca de áudio e legendas, progresso, tela cheia,
// atalhos de teclado e troca de link no meio do filme. A view (PlayerView) só desenha o estado daqui.
import Hls from 'hls.js';
import { Store } from './Store.js';
import { url, apiFetch, postJson, rebase, headers, ensureHealthy, onEndpointChange } from '../models/api.js';
import { fetchMedia, streamPath, downloadPath, fmtClock } from '../models/movies.js';
import { getProgress, saveProgress, clearProgress } from '../models/progress.js';
import { prefs } from '../models/preferences.js';
import { fetchSubtitle, activeCueText } from '../models/subtitles.js';

const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;

const initial = {
  open: false, movie: null, title: '', downloadUrl: '',
  error: null, spinner: { on: false, text: '' },
  playing: false, muted: false, volume: 1,
  time: 0, duration: 0, readyFrom: 0, readyTo: 0,
  dragFrac: null, hover: null, idle: false, menuOpen: false,
  info: null, audio: 0, sub: 'off', subText: '', subScale: prefs.get('subSize') || '1',
  fullscreen: false
};

class PlayerController extends Store {
  constructor() {
    super(initial);
    // Estado interno que não aparece na tela
    this.p = { mode: 'direct', hls: null, session: null, offset: 0, readyDur: 0, cues: [], token: 0, raf: 0, lastSave: 0 };
    onEndpointChange(() => this.onEndpointChange());
    addEventListener('pagehide', () => { this.rememberProgress(); this.stopServerSession(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.rememberProgress(); });
    const onFs = () => {
      const on = !!fsElement();
      this.set({ fullscreen: on });
      if (!on) try { screen.orientation?.unlock?.(); } catch { /* sem suporte */ }
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
  }

  /* ---------- Ligação com a view ---------- */

  attach(video, stage) {
    this.video = video;
    this.stage = stage;
    const on = (ev, fn) => { video.addEventListener(ev, fn); return () => video.removeEventListener(ev, fn); };
    const offs = [
      on('play', () => this.set({ playing: true })),
      on('pause', () => { this.set({ playing: false }); this.showControls(); this.rememberProgress(); }),
      on('waiting', () => {
        this.spinner(true, 'Carregando…');
        // Vídeo travado esperando dados por muito tempo: pode ser o link que caiu
        clearTimeout(this.stallTimer);
        this.stallTimer = setTimeout(() => { if (this.state.movie) ensureHealthy(); }, 5000);
      }),
      on('playing', () => { this.spinner(false); clearTimeout(this.stallTimer); }),
      on('canplay', () => { if (!video.paused) this.spinner(false); }),
      on('seeked', () => { if (!video.paused) this.spinner(false); }),
      on('volumechange', () => this.set({ volume: video.volume, muted: video.muted })),
      on('timeupdate', () => {
        if (Date.now() - this.p.lastSave < 5000 || video.paused) return;
        this.p.lastSave = Date.now();
        this.rememberProgress();
      }),
      on('ended', () => {
        const m = this.state.movie;
        if (m) saveProgress(m.id, this.mediaDuration(), this.mediaDuration());
        this.showControls();
      }),
      on('error', () => {
        if (!this.state.open || !this.state.movie || this.p.hls || !video.getAttribute('src')) return;
        // Reprodução direta falhou: tenta converter com o ffmpeg
        if (this.p.mode === 'direct' && this.state.info?.ffmpeg) { this.p.mode = 'hls'; this.loadSource(this.absTime()); }
        else this.showError('O navegador não suporta este formato');
      })
    ];
    return () => offs.forEach(off => off());
  }

  /* ---------- Abrir / fechar ---------- */

  async open(m, { fromStart = false } = {}) {
    const video = this.video;
    this.closeMedia();
    Object.assign(this.p, { mode: 'direct', offset: 0, readyDur: 0, cues: [] });
    const vol = Number(prefs.get('volume'));
    if (prefs.get('volume') !== null && !Number.isNaN(vol)) video.volume = vol;
    this.set({
      ...initial, open: true, movie: m, title: m.title + (m.year ? ` (${m.year})` : ''),
      downloadUrl: url(downloadPath(m.id)), subScale: this.state.subScale,
      volume: video.volume, muted: video.muted, fullscreen: !!fsElement(),
      spinner: { on: true, text: 'Analisando arquivo…' }
    });
    this.loop();
    this.showControls();

    let info;
    try { info = await fetchMedia(m.id); } catch (err) { return this.showError(err.message); }
    if (this.state.movie !== m) return;
    this.p.mode = info.ffmpeg ? info.mode : 'direct';

    // Preferências de idioma lembradas entre filmes
    const aPref = prefs.get('audioLang');
    const aIdx = info.audio.findIndex(a => aPref && a.langKey === aPref);
    const saved = Number(prefs.get('audio.' + m.id)); // faixa escolhida antes neste filme
    const audio = Number.isInteger(saved) && prefs.get('audio.' + m.id) !== null && info.audio[saved] ? saved
      : aIdx >= 0 ? aIdx : Math.max(0, info.audio.findIndex(a => a.default));
    let sub = 'off';
    const sPref = prefs.get('subLang');
    if (sPref && sPref !== 'off') {
      const usable = info.subtitles.filter(s => s.supported && s.langKey === sPref);
      const pick = usable.find(s => !s.forced) || usable[0];
      if (pick) sub = pick.id;
    }
    this.set({ info, audio, sub, duration: info.duration || 0 });
    if (sub !== 'off') this.loadSubtitle(sub);

    // Continua de onde esta pessoa parou (o progresso fica no navegador dela)
    if (fromStart) clearProgress(m.id);
    const resume = fromStart ? 0 : Math.max(0, (getProgress(m.id)?.t || 0) - 3);
    await this.loadSource(resume);
    if (resume && this.state.movie === m) this.flash('Continuando de ' + fmtClock(resume));
  }

  /** Pedido de fechar (botão voltar). A view fecha o <dialog>, que chama onClosed. */
  requestClose() { this.set({ open: false }); }

  /** O <dialog> fechou (botão, Esc ou clique fora) */
  onClosed() {
    if (!this.state.movie) return;
    this.rememberProgress();
    this.closeMedia();
    cancelAnimationFrame(this.p.raf);
    if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {});
    this.set({ open: false, movie: null, menuOpen: false });
  }

  stopServerSession() {
    if (!this.p.session) return;
    const stop = url(`/api/sessions/${this.p.session}/stop`);
    navigator.sendBeacon?.(stop) || fetch(stop, { method: 'POST', keepalive: true });
    this.p.session = null;
  }

  closeMedia() {
    const video = this.video;
    this.p.token++;
    if (this.p.hls) { this.p.hls.destroy(); this.p.hls = null; }
    video.pause();
    video.removeAttribute('src');
    video.load();
    this.stopServerSession();
  }

  showError(msg) {
    this.spinner(false);
    this.closeMedia();
    this.set({ error: (msg ? msg + '. ' : '') + 'Você pode baixar o arquivo e abrir em um player como o VLC.' });
  }

  spinner(on, text) { this.set(s => ({ spinner: { on, text: text || s.spinner.text } })); }

  /* ---------- Fonte de vídeo ---------- */

  absTime() { return this.p.offset + (this.video.currentTime || 0); }
  mediaDuration() { return this.state.duration || (Number.isFinite(this.video.duration) ? this.video.duration : 0); }

  async loadSource(start, autoplay = true) {
    const { video, p } = this;
    const m = this.state.movie;
    const token = ++p.token;
    if (p.hls) { p.hls.destroy(); p.hls = null; }
    p.readyDur = 0;

    if (p.mode === 'direct') {
      this.spinner(true, 'Carregando…');
      p.offset = 0;
      video.src = url(streamPath(m.id));
      if (start) video.addEventListener('loadedmetadata', () => { video.currentTime = start; }, { once: true });
      if (autoplay) video.play().catch(() => {});
      return;
    }

    this.spinner(true, start > 0 ? 'Carregando a partir de ' + fmtClock(start) + '…' : 'Convertendo vídeo para o navegador…');
    video.pause();
    let j;
    try {
      j = await postJson(`/api/movies/${m.id}/play`, { audio: this.state.audio, start, previous: p.session });
    } catch (err) {
      if (token === p.token) this.showError(err.message);
      return;
    }
    if (token !== p.token) { // a pessoa já pediu outra coisa
      apiFetch(`/api/sessions/${j.session}/stop`, { method: 'POST' });
      return;
    }
    p.session = j.session;
    p.offset = j.start;

    if (Hls.isSupported()) {
      const hls = new Hls({
        startPosition: 0, maxBufferLength: 60, maxMaxBufferLength: 120, backBufferLength: 90,
        // Cada pedido (lista e pedaços) vai pelo link em uso no momento, mesmo que ele mude no meio do filme,
        // e com o cabeçalho que evita a página de aviso do ngrok
        xhrSetup: (xhr, u) => {
          xhr.open('GET', rebase(u), true);
          for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        }
      });
      p.hls = hls;
      hls.on(Hls.Events.LEVEL_UPDATED, (_e, d) => { p.readyDur = d.details.totalduration || 0; });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (autoplay) video.play().catch(() => {}); });
      let retries = 0;
      hls.on(Hls.Events.ERROR, (_e, d) => {
        // Falha de rede: confere se o link caiu e troca de link; o hls.js tenta de novo já pelo novo
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) ensureHealthy();
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && retries++ < 5) ensureHealthy().then(() => hls.startLoad());
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && retries++ < 5) hls.recoverMediaError();
        else this.showError('Erro na reprodução (' + d.details + ')');
      });
      hls.loadSource(j.url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url(j.url); // Safari / iPhone tocam HLS nativamente
      if (autoplay) video.play().catch(() => {});
    } else {
      this.showError('Este navegador não suporta o vídeo convertido');
    }
  }

  availableEnd() {
    const { p, video } = this;
    if (p.mode === 'direct') return this.state.duration;
    if (p.readyDur) return p.offset + p.readyDur;
    const s = video.seekable;
    return s.length ? p.offset + s.end(s.length - 1) : p.offset;
  }

  seek(target) {
    if (!this.state.movie || (!this.state.info && this.p.mode !== 'direct')) return;
    const dur = this.mediaDuration();
    target = Math.max(0, Math.min(target, dur ? dur - 1 : target));
    if (this.p.mode === 'direct') { this.video.currentTime = target; return; }
    const rel = target - this.p.offset;
    // Dentro do trecho já convertido: só posiciona. Fora: reinicia a conversão a partir dali.
    if (rel >= 0 && target <= this.availableEnd() - 2) this.video.currentTime = rel;
    else this.loadSource(target, true);
  }

  seekBy(delta) { this.seek(this.absTime() + delta); }

  /* ---------- Troca de link no meio do filme ---------- */

  onEndpointChange() {
    const m = this.state.movie;
    if (!m || !this.state.open) return;
    this.set({ downloadUrl: url(downloadPath(m.id)) });
    if (this.p.hls) { this.p.hls.startLoad(); return; } // hls.js já usa o novo link nos próximos pedidos
    const video = this.video, src = video.getAttribute('src');
    if (!src) return;
    const t = video.currentTime, playing = !video.paused;
    video.src = rebase(src);
    video.addEventListener('loadedmetadata', () => { video.currentTime = t; if (playing) video.play().catch(() => {}); }, { once: true });
  }

  /* ---------- Progresso ---------- */

  rememberProgress() {
    const m = this.state.movie;
    // Só salva quando o vídeo está de fato carregado (evita gravar 0 durante a troca de trecho)
    if (!m || this.state.error || !this.video || this.video.readyState < 2) return;
    saveProgress(m.id, this.absTime(), this.mediaDuration());
  }

  /* ---------- Áudio e legendas ---------- */

  selectAudio(idx) {
    this.set({ menuOpen: false });
    if (idx === this.state.audio) return;
    const a = this.state.info.audio[idx];
    if (a?.langKey) prefs.set('audioLang', a.langKey);
    prefs.set('audio.' + this.state.movie.id, String(idx));
    this.set({ audio: idx });
    if (this.p.mode === 'direct') return; // arquivos diretos têm no máximo uma faixa
    this.loadSource(this.absTime());
  }

  selectSub(id) {
    const s = this.state.info.subtitles.find(x => x.id === id);
    prefs.set('subLang', id === 'off' ? 'off' : (s?.langKey || ''));
    this.set({ sub: id, menuOpen: false });
    if (id === 'off') { this.p.cues = []; this.set({ subText: '' }); } else this.loadSubtitle(id);
  }

  setSubScale(v) { prefs.set('subSize', v); this.set({ subScale: v }); }

  async loadSubtitle(id) {
    const m = this.state.movie;
    this.p.cues = [];
    this.set({ subText: 'Carregando legenda…' });
    try {
      const cues = await fetchSubtitle(m.id, id);
      if (this.state.movie !== m || this.state.sub !== id) return;
      this.p.cues = cues;
      this.set({ subText: '' });
    } catch (err) {
      if (this.state.sub === id) { this.set({ subText: '' }); this.flash('Não foi possível carregar a legenda: ' + err.message); }
    }
  }

  /** Mensagem rápida no lugar da legenda */
  flash(msg) {
    this.flashing = true;
    this.set({ subText: msg });
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { this.flashing = false; this.set({ subText: '' }); }, 3500);
  }

  /* ---------- Loop de atualização (tempo, barra e legendas) ---------- */

  loop() {
    cancelAnimationFrame(this.p.raf);
    const tick = () => {
      if (!this.state.open) return;
      const video = this.video;
      const t = this.absTime();
      const dur = this.mediaDuration();
      let from = this.p.offset, to = this.availableEnd();
      if (this.p.mode === 'direct') {
        const b = video.buffered;
        from = 0; to = 0;
        for (let i = 0; i < b.length; i++) if (b.start(i) <= video.currentTime + 1) to = b.end(i);
      }
      const patch = {
        time: Math.round(t * 10) / 10,
        duration: dur,
        readyFrom: dur ? from / dur : 0,
        readyTo: dur ? Math.min(to, dur) / dur : 0
      };
      if (this.p.cues.length && !this.flashing) patch.subText = activeCueText(this.p.cues, t);
      this.set(patch);
      this.p.raf = requestAnimationFrame(tick);
    };
    this.p.raf = requestAnimationFrame(tick);
  }

  /* ---------- Controles ---------- */

  togglePlay() {
    const v = this.video;
    if (!this.state.movie || this.state.error) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
  }

  setVolume(v) {
    this.video.volume = v;
    this.video.muted = false;
    prefs.set('volume', v);
  }
  nudgeVolume(d) { this.setVolume(Math.max(0, Math.min(1, this.video.volume + d))); }
  toggleMute() { this.video.muted = !this.video.muted; }

  toggleMenu(force) {
    if (!this.state.info) return;
    this.set(s => ({ menuOpen: force ?? !s.menuOpen }));
    this.showControls();
  }

  // Tela cheia de verdade: o navegador não deixa um <dialog> entrar em tela cheia, então usamos a área do vídeo
  async toggleFullscreen() {
    if (fsElement()) {
      try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch { /* já saiu */ }
      return;
    }
    const stage = this.stage;
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (req) {
      try {
        await req.call(stage, { navigationUI: 'hide' });
        // No celular, gira para paisagem automaticamente
        if (matchMedia('(pointer: coarse)').matches) await screen.orientation?.lock?.('landscape').catch(() => {});
        return;
      } catch { /* tenta o modo do iPhone abaixo */ }
    }
    if (this.video.webkitEnterFullscreen) this.video.webkitEnterFullscreen(); // iPhone: só o próprio vídeo
  }

  /* Esconde os controles quando o vídeo está tocando e a pessoa não mexe */
  showControls() {
    this.set({ idle: false });
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.video && !this.video.paused && !this.state.menuOpen && this.state.dragFrac === null) this.set({ idle: true });
    }, 3000);
  }

  onStagePointerMove(pointerType) { if (pointerType === 'mouse') this.showControls(); }

  onVideoPointerUp(pointerType) {
    this.set({ menuOpen: false });
    if (pointerType === 'mouse') { this.togglePlay(); this.showControls(); return; }
    // Toque: primeiro mostra/esconde os controles
    if (this.state.idle) this.showControls();
    else { clearTimeout(this.idleTimer); this.set({ idle: true }); }
  }

  /* Barra de progresso: clicar/arrastar */
  dragStart(frac) { if (this.state.duration) this.set({ dragFrac: frac }); }
  dragMove(frac) {
    const d = this.state.duration;
    this.set(s => ({
      hover: d ? { frac, text: fmtClock(frac * d) } : null,
      dragFrac: s.dragFrac === null ? null : frac
    }));
  }
  dragEnd(frac) {
    if (this.state.dragFrac === null) return;
    this.set({ dragFrac: null, hover: null });
    this.seek(frac * this.state.duration);
  }
  dragCancel() { this.set({ dragFrac: null }); }
  hoverLeave() { if (this.state.dragFrac === null) this.set({ hover: null }); }

  handleKey(e) {
    if (!this.state.open || this.state.error || ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { e.preventDefault(); this.togglePlay(); }
    else if (k === 'arrowleft') { e.preventDefault(); this.seekBy(-10); }
    else if (k === 'arrowright') { e.preventDefault(); this.seekBy(10); }
    else if (k === 'arrowup') { e.preventDefault(); this.nudgeVolume(0.1); }
    else if (k === 'arrowdown') { e.preventDefault(); this.nudgeVolume(-0.1); }
    else if (k === 'f') this.toggleFullscreen();
    else if (k === 'm') this.toggleMute();
    else if (k === 'c') this.toggleMenu();
    else return;
    this.showControls();
  }
}

export const player = new PlayerController();
