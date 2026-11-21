import { memo, useState } from 'react';
import { Play } from './Icons.jsx';
import { url } from '../models/api.js';
import { fmtSize } from '../models/movies.js';

/** Card de um filme. memo: só redesenha se o filme ou o progresso mudarem (não pisca nas atualizações) */
function MovieCard({ movie: m, percent, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button className="card" aria-label={`${m.title}${m.year ? ', ' + m.year : ''}`} onClick={() => onOpen(m)}>
      <div className="poster">
        {!loaded && <div className="shimmer"></div>}
        {m.cover && (
          <img src={url(m.cover)} alt="" loading="lazy" decoding="async" className={loaded ? 'loaded' : ''}
            onLoad={() => setLoaded(true)} ref={el => { if (el?.complete && el.naturalWidth && !loaded) setLoaded(true); }} />
        )}
        <span className="badge">{m.ext}</span>
        {m.enhance?.status === 'done' && <span className="badge hd" title="Imagem melhorada">HD+</span>}
        {percent > 0 && <div className="watch" title={`Você parou em ${percent}%`}><i style={{ width: percent + '%' }}></i></div>}
        <div className="play"><span><Play /></span></div>
      </div>
      <p className="card-title">{m.title}</p>
      <p className="card-meta">{m.year || '—'} · {fmtSize(m.size)}</p>
    </button>
  );
}

export default memo(MovieCard);
