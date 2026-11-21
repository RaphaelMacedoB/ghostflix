// Model: preferências desta pessoa (idioma de áudio/legenda, tamanho da legenda, volume), no navegador.
export const prefs = {
  get(k) { try { return localStorage.getItem('gf.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('gf.' + k, v); } catch { /* sem armazenamento */ } }
};
