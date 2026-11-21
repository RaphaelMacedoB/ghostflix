// Server-Sent Events: avisa os navegadores em tempo real quando a biblioteca muda.
export class EventHub {
  constructor() { this.clients = new Set(); }

  /** Liga as mudanças da biblioteca aos navegadores conectados */
  watch(library) {
    for (const ev of ['added', 'updated', 'removed', 'reload']) library.on(ev, data => this.broadcast(ev, data));
    return this;
  }

  broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) res.write(payload);
  }

  connect(req, res) {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    res.write('event: hello\ndata: {}\n\n'); // o navegador sabe que o "ao vivo" funciona por este link
    this.clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); this.clients.delete(res); });
  }
}
