import { useRef } from 'react';
import { player } from '../../controllers/PlayerController.js';

/** Barra de progresso: mostra o trecho já carregado/convertido, permite clicar e arrastar */
export default function SeekBar({ time, duration, readyFrom, readyTo, dragFrac, hover }) {
  const el = useRef(null);
  const fracAt = e => {
    const r = el.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const frac = dragFrac ?? (duration ? Math.max(0, Math.min(1, time / duration)) : 0);
  return (
    <div ref={el} className={`pc-seek${dragFrac !== null ? ' dragging' : ''}`}
      onPointerDown={e => { if (!duration) return; el.current.setPointerCapture(e.pointerId); player.dragStart(fracAt(e)); }}
      onPointerMove={e => player.dragMove(fracAt(e))}
      onPointerLeave={() => player.hoverLeave()}
      onPointerUp={e => player.dragEnd(fracAt(e))}
      onPointerCancel={() => player.dragCancel()}>
      <div className="pc-track">
        <div className="pc-ready" style={{ left: readyFrom * 100 + '%', width: Math.max(0, readyTo - readyFrom) * 100 + '%' }}></div>
        <div className="pc-fill" style={{ width: frac * 100 + '%' }}></div>
        <div className="pc-knob" style={{ left: frac * 100 + '%' }}></div>
      </div>
      {hover && <div className="pc-hover" style={{ left: hover.frac * 100 + '%' }}>{hover.text}</div>}
    </div>
  );
}
