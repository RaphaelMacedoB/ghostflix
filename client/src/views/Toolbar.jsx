import { SORTS } from '../models/movies.js';

function Select({ label, value, onChange, options, all }) {
  return (
    <label className="select">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {all && <option value="">{all}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** Título da seção, contador e filtros (ordenar, década, formato) */
export default function Toolbar({ filters, setFilter, decades, formats, shown, total, onClear }) {
  const active = filters.query || filters.decade || filters.format;
  return (
    <div className="toolbar">
      <h2 className="section-title">Todos os filmes <span className="count">{total ? `(${shown}${active ? ' de ' + total : ''})` : ''}</span></h2>
      <div className="filters">
        <Select label="Ordenar" value={filters.sort} onChange={v => setFilter('sort', v)} options={SORTS} />
        <Select label="Década" value={filters.decade} onChange={v => setFilter('decade', v)} options={decades} all="Todas" />
        <Select label="Formato" value={filters.format} onChange={v => setFilter('format', v)} options={formats} all="Todos" />
        {active && <button className="btn btn-small btn-ghost" onClick={onClear}>Limpar filtros</button>}
      </div>
    </div>
  );
}
