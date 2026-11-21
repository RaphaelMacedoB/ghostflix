import MovieCard from './MovieCard.jsx';
import { Ghost } from './Icons.jsx';
import { progressPercent } from '../models/progress.js';

export default function MovieGrid({ movies, total, onOpen }) {
  if (!movies.length) {
    return (
      <div className="empty">
        <Ghost />
        {total ? (
          <>
            <h3>Nada encontrado</h3>
            <p>Nenhum filme corresponde à busca ou aos filtros selecionados.</p>
          </>
        ) : (
          <>
            <h3>Nenhum filme por aqui… ainda</h3>
            <p>Coloque arquivos de vídeo (.mp4, .mkv, .avi…) na pasta <code>Filmes</code>. Eles aparecem aqui automaticamente.</p>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="grid" aria-live="polite">
      {movies.map(m => <MovieCard key={m.id} movie={m} percent={progressPercent(m.id)} onOpen={onOpen} />)}
    </div>
  );
}
