import { useEffect, useRef } from 'react';
import Dialog from '../Dialog.jsx';
import SeekBar from './SeekBar.jsx';
import TracksMenu from './TracksMenu.jsx';
import { Back, Play, Pause, Rewind, Forward, Volume, Muted, Tracks, FullEnter, FullExit } from '../Icons.jsx';
import { player } from '../../controllers/PlayerController.js';
import { useStore } from '../../controllers/Store.js';
import { fmtClock } from '../../models/movies.js';

/** View do player: só desenha o estado do PlayerController e repassa as ações a ele */
export default function PlayerView() {
  const s = useStore(player);
  const video = useRef(null);
  const stage = useRef(null);

  useEffect(() => player.attach(video.current, stage.current), []);
  useEffect(() => {
    const onKey = e => player.handleKey(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog className="player" open={s.open} onClose={() => player.onClosed()}>
      <div ref={stage} className={`stage${s.idle ? ' idle' : ''}`} hidden={!!s.error}
        onPointerMove={e => player.onStagePointerMove(e.pointerType)}>
        <video ref={video} playsInline preload="auto"
          onPointerUp={e => player.onVideoPointerUp(e.pointerType)}
          onDoubleClick={() => player.toggleFullscreen()} />
        <div className="subs" aria-live="off" style={{ '--sub-scale': s.subScale }}>{s.subText && <span>{s.subText}</span>}</div>
        {s.spinner.on && <div className="spinner"><i></i><span>{s.spinner.text}</span></div>}

        <div className="pc-top">
          <button className="pc-btn" aria-label="Fechar player" onClick={() => player.requestClose()}><Back /></button>
          <div className="pc-title">{s.title}</div>
        </div>

        <div className="pc-bottom">
          <SeekBar time={s.time} duration={s.duration} readyFrom={s.readyFrom} readyTo={s.readyTo} dragFrac={s.dragFrac} hover={s.hover} />
          <div className="pc-row">
            <button className={`pc-btn${s.playing ? ' playing' : ''}`} aria-label="Reproduzir/pausar" onClick={() => player.togglePlay()}>
              {s.playing ? <Pause /> : <Play />}
            </button>
            <button className="pc-btn" id="pcBack" aria-label="Voltar 10 segundos" onClick={() => player.seekBy(-10)}><Rewind /></button>
            <button className="pc-btn" id="pcFwd" aria-label="Avançar 10 segundos" onClick={() => player.seekBy(10)}><Forward /></button>
            <div className="pc-volume">
              <button className="pc-btn" aria-label="Silenciar" onClick={() => player.toggleMute()}>
                {s.muted || s.volume === 0 ? <Muted /> : <Volume />}
              </button>
              <input type="range" min="0" max="1" step="0.05" aria-label="Volume"
                value={s.muted ? 0 : s.volume} onChange={e => player.setVolume(Number(e.target.value))} />
            </div>
            <span className="pc-time">{fmtClock(s.time)} / {fmtClock(s.duration)}</span>
            <span className="pc-spacer"></span>
            <button className={`pc-btn${s.sub !== 'off' ? ' active' : ''}`} aria-label="Áudio e legendas" aria-haspopup="true"
              onClick={e => { e.stopPropagation(); player.toggleMenu(); }}><Tracks /></button>
            <button className="pc-btn" aria-label={s.fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => player.toggleFullscreen()}>
              {s.fullscreen ? <FullExit /> : <FullEnter />}
            </button>
          </div>
        </div>

        {s.menuOpen && s.info && <TracksMenu info={s.info} audio={s.audio} sub={s.sub} subScale={s.subScale} />}
      </div>

      {s.error && (
        <div className="player-error">
          <h3>Não foi possível reproduzir este vídeo</h3>
          <p>{s.error}</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={s.downloadUrl} download>Baixar arquivo</a>
            <button className="btn btn-ghost" onClick={() => player.requestClose()}>Fechar</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
