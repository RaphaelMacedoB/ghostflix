import { useEffect, useState } from 'react';
import Dialog from './Dialog.jsx';
import { Play, Restart } from './Icons.jsx';
import { url } from '../models/api.js';
import { downloadPath, enhanceText, fmtShort, fmtSize } from '../models/movies.js';
import { getProgress } from '../models/progress.js';
import { library } from '../controllers/LibraryController.js';

/** Detalhes do filme: capa, sinopse, assistir/continuar, baixar e corrigir título */
export default function DetailsDialog({ movie: m, open, onClose, onPlay }) {
  const [fixOpen, setFixOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');

  // Ao abrir outro filme, o formulário começa com os dados dele
  useEffect(() => {
    if (!open || !m) return;
    setFixOpen(false);
    setTitle(m.title);
    setYear(m.year || '');
  }, [open, m?.id]);

  const progress = m ? getProgress(m.id) : null;
  const e = m?.enhance;
  const eText = enhanceText(e);

  async function submit(ev) {
    ev.preventDefault();
    try { await library.rename(m.id, title, year); onClose(); } catch { /* mantém aberto */ }
  }

  return (
    <Dialog className="modal" open={open} onClose={onClose}>
      <button className="icon-btn close" aria-label="Fechar" onClick={onClose}>✕</button>
      {m && (
        <div className="details">
          <img className="details-cover" alt="" src={m.cover ? url(m.cover) : undefined} />
          <div className="details-body">
            <h2>{m.title}</h2>
            <p className="details-meta">
              {[m.year, m.ext.toUpperCase(), fmtSize(m.size), m.coverSource ? `capa: ${m.coverSource}` : null].filter(Boolean).join(' • ')}
            </p>
            {eText && (
              <div className={`enhance${e.status === 'done' ? ' done' : ''}`}>
                <span>{eText}</span>
                <div className="enhance-bar"><i style={{ width: `${e.status === 'running' ? e.progress : 0}%` }}></i></div>
              </div>
            )}
            <p className="details-overview">{m.overview}</p>
            <div className="details-actions">
              <button className="btn btn-primary" onClick={() => onPlay(m)}>
                <Play /><span>{progress ? `Continuar (${fmtShort(progress.t)})` : 'Assistir'}</span>
              </button>
              {progress && <button className="btn btn-ghost" onClick={() => onPlay(m, { fromStart: true })}><Restart />Do início</button>}
              <a className="btn btn-ghost" href={url(downloadPath(m.id))} download>Baixar</a>
            </div>
            <details className="fix" open={fixOpen} onToggle={ev => setFixOpen(ev.currentTarget.open)}>
              <summary>Capa errada? Corrigir título</summary>
              <form onSubmit={submit}>
                <input id="fixTitle" placeholder="Título" required value={title} onChange={ev => setTitle(ev.target.value)} />
                <input id="fixYear" placeholder="Ano" inputMode="numeric" maxLength={4} value={year} onChange={ev => setYear(ev.target.value)} />
                <button className="btn btn-small btn-primary" type="submit">Buscar capa de novo</button>
              </form>
            </details>
            <p className="details-file">{m.file}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
