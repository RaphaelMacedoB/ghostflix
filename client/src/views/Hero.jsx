import { Play, Info } from './Icons.jsx';
import { url } from '../models/api.js';
import { fmtSize } from '../models/movies.js';

/** Destaque do filme adicionado mais recentemente */
export default function Hero({ movie, onPlay, onInfo }) {
  if (!movie) return null;
  return (
    <section className="hero">
      <div className="hero-bg" style={{ backgroundImage: movie.cover ? `url("${url(movie.cover)}")` : '' }}></div>
      <div className="hero-content">
        <span className="hero-tag">Adicionado recentemente</span>
        <h1>{movie.title}</h1>
        <p className="hero-meta">{[movie.year, movie.ext.toUpperCase(), fmtSize(movie.size)].filter(Boolean).join(' • ')}</p>
        <p className="hero-overview">{movie.overview}</p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => onPlay(movie)}><Play />Assistir</button>
          <button className="btn btn-ghost" onClick={() => onInfo(movie)}><Info />Detalhes</button>
        </div>
      </div>
    </section>
  );
}
