import { useEffect, useRef, useState } from 'react';
import { Ghost, Search } from './Icons.jsx';
import { player } from '../controllers/PlayerController.js';

export default function TopBar({ query, onQuery, live }) {
  const [scrolled, setScrolled] = useState(false);
  const [text, setText] = useState(query);
  const input = useRef(null);

  useEffect(() => setText(query), [query]);
  // Espera a pessoa parar de digitar um instante antes de filtrar
  useEffect(() => {
    if (text === query) return;
    const t = setTimeout(() => onQuery(text), 120);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 10);
    const onKey = e => {
      if (e.key === '/' && !player.getState().open && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        input.current.focus();
      }
    };
    addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => { removeEventListener('scroll', onScroll); document.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <header className={`topbar${scrolled ? ' scrolled' : ''}`}>
      <a className="brand" href="/" aria-label="Ghostflix - início">
        <Ghost className="brand-ghost" />
        <span className="brand-name">GHOST <b>FLIX</b></span>
      </a>
      <div className="search">
        <Search />
        <input ref={input} type="search" placeholder="Buscar filmes…" autoComplete="off" enterKeyHint="search"
          aria-label="Buscar filmes" value={text} onChange={e => setText(e.target.value)} />
      </div>
      <span className={`live${live.on ? ' on' : ''}`} title="Conexão em tempo real com a pasta Filmes"><i></i><span>{live.text}</span></span>
    </header>
  );
}
