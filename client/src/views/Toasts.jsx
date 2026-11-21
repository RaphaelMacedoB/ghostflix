import { toasts } from '../controllers/ToastController.js';
import { useStore } from '../controllers/Store.js';

export default function Toasts() {
  const { toasts: list } = useStore(toasts);
  return (
    <div className="toasts" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className={`toast${t.out ? ' out' : ''}`}>
          {t.img && <img src={t.img} alt="" />}
          <div><b>{t.title}</b><span>{t.text}</span></div>
        </div>
      ))}
    </div>
  );
}
