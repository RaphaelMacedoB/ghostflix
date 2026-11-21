import fsp from 'node:fs/promises';

export async function fileExists(f) {
  try { await fsp.access(f); return true; } catch { return false; }
}

// Remove sem derrubar o servidor se o Windows ainda estiver segurando o arquivo
export async function safeRm(p, opts = {}) {
  for (let i = 0; i < 5; i++) {
    try { await fsp.rm(p, { force: true, ...opts }); return true; } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  console.warn(`[aviso] não foi possível apagar ${p} (arquivo em uso)`);
  return false;
}
