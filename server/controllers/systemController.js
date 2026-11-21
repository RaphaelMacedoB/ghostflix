// Controller: tempo real (SSE), verificação de vida e lista de links públicos para a troca automática.
export function systemController({ events, links }) {
  return {
    events: (req, res) => events.connect(req, res),
    ping: (_req, res) => res.set('Cache-Control', 'no-store').json({ ok: true }),
    endpoints: (_req, res) => res.set('Cache-Control', 'no-store').json({ endpoints: links.list() })
  };
}
