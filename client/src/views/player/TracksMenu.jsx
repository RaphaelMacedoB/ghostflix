import { player } from '../../controllers/PlayerController.js';

/** Menu de faixas de áudio e legendas */
export default function TracksMenu({ info, audio, sub, subScale }) {
  return (
    <div className="tracks" onClick={e => e.stopPropagation()}>
      <div className="tracks-col">
        <h4>Áudio</h4>
        <ul>
          {info.audio.length
            ? info.audio.map(a => (
              <li key={a.index}><button className={a.index === audio ? 'sel' : ''} onClick={() => player.selectAudio(a.index)}>{a.label}</button></li>
            ))
            : <li><button disabled>Sem faixas de áudio</button></li>}
        </ul>
      </div>
      <div className="tracks-col">
        <h4>Legendas</h4>
        <ul>
          <li><button className={sub === 'off' ? 'sel' : ''} onClick={() => player.selectSub('off')}>Desativadas</button></li>
          {info.subtitles.map(s => (
            <li key={s.id}>
              <button className={s.id === sub ? 'sel' : ''} disabled={!s.supported} onClick={() => player.selectSub(s.id)}>
                {s.label}{s.note && <> <small>({s.note})</small></>}
              </button>
            </li>
          ))}
          {!info.subtitles.length && (
            <li><button disabled><small>Nenhuma legenda encontrada. Coloque um arquivo .srt com o mesmo nome do filme na pasta.</small></button></li>
          )}
        </ul>
        <label className="subsize">Tamanho
          <select value={subScale} onChange={e => player.setSubScale(e.target.value)}>
            <option value="0.8">Pequena</option><option value="1">Normal</option><option value="1.3">Grande</option><option value="1.6">Enorme</option>
          </select>
        </label>
      </div>
    </div>
  );
}
