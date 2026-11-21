import { useEffect, useRef } from 'react';

/**
 * <dialog> nativo controlado pelo React: abre com showModal quando open=true,
 * fecha com Esc, clique fora ou open=false, e avisa onClose.
 */
export default function Dialog({ open, onClose, className, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={className} onClose={onClose} onClick={e => { if (e.target === ref.current) ref.current.close(); }}>
      {children}
    </dialog>
  );
}
