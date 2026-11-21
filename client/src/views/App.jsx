import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import TopBar from './TopBar.jsx';
import Hero from './Hero.jsx';
import Toolbar from './Toolbar.jsx';
import MovieGrid from './MovieGrid.jsx';
import DetailsDialog from './DetailsDialog.jsx';
import Toasts from './Toasts.jsx';
import PlayerView from './player/PlayerView.jsx';
import { library } from '../controllers/LibraryController.js';
import { player } from '../controllers/PlayerController.js';
import { useStore } from '../controllers/Store.js';
import { filterMovies, decadeOptions, formatOptions, latestMovie } from '../models/movies.js';
import { subscribeProgress, progressVersion } from '../models/progress.js';
import { currentBase, onEndpointChange } from '../models/api.js';

const EMPTY_FILTERS = { query: '', sort: 'recent', decade: '', format: '' };

export default function App() {
  const { movies, live } = useStore(library);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [detailsId, setDetailsId] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Redesenha quando o progresso salvo muda (barrinhas dos cards, botão "Continuar")
  const progress = useSyncExternalStore(subscribeProgress, progressVersion);
  // Redesenha as imagens quando o link em uso muda (troca automática ngrok ⇄ Cloudflare)
  const [base, setBase] = useState(currentBase());

  useEffect(() => { library.start(); return onEndpointChange(() => setBase(currentBase())); }, []);

  const shown = useMemo(() => filterMovies(movies, filters), [movies, filters]);
  const decades = useMemo(() => decadeOptions(movies), [movies]);
  const formats = useMemo(() => formatOptions(movies), [movies]);
  const hero = filters.query ? null : latestMovie(movies);
  const details = movies.find(m => m.id === detailsId) || null;

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const openDetails = m => { setDetailsId(m.id); setDetailsOpen(true); };
  const play = (m, opts) => { setDetailsOpen(false); player.open(m, opts); };

  return (
    <>
      <TopBar query={filters.query} onQuery={q => setFilter('query', q)} live={live} />
      <Hero key={base} movie={hero} onPlay={play} onInfo={openDetails} />
      <main className="content">
        <Toolbar filters={filters} setFilter={setFilter} decades={decades} formats={formats}
          shown={shown.length} total={movies.length} onClear={() => setFilters(f => ({ ...EMPTY_FILTERS, sort: f.sort }))} />
        <MovieGrid key={base} movies={shown} total={movies.length} onOpen={openDetails} progress={progress} />
      </main>
      <DetailsDialog movie={details} open={detailsOpen && !!details} onClose={() => setDetailsOpen(false)} onPlay={play} />
      <PlayerView />
      <Toasts />
    </>
  );
}
