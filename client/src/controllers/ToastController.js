// Controller: avisos rápidos no canto da tela ("Novo filme adicionado", "Capa encontrada"…).
import { Store } from './Store.js';

class ToastController extends Store {
  constructor() { super({ toasts: [] }); this.seq = 0; }

  show(title, text, img) {
    const id = ++this.seq;
    this.set(s => ({ toasts: [...s.toasts, { id, title, text, img, out: false }] }));
    setTimeout(() => {
      this.set(s => ({ toasts: s.toasts.map(t => t.id === id ? { ...t, out: true } : t) }));
      setTimeout(() => this.set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 300);
    }, 4500);
  }
}

export const toasts = new ToastController();
