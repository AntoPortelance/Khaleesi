const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 8000;
const HEARTBEAT_MS = 4000;
const SILENCE_LIMIT_MS = 10000;

/**
 * Keeps a WebSocket open, reconnecting with an increasing delay. Heartbeats reveal a
 * server that stopped answering, which a browser would otherwise take long to notice.
 */
export function connectEvents({ onOpen, onClose, onEvent }) {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${scheme}//${window.location.host}/ws/events`;
  let current = null;
  let retryMs = MIN_RETRY_MS;

  function open() {
    const socket = new WebSocket(url);
    let lastHeard = Date.now();
    let heartbeat = null;
    current = socket;

    function lose() {
      if (current !== socket) return;
      current = null;
      window.clearInterval(heartbeat);
      onClose();
      window.setTimeout(open, retryMs);
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    }

    socket.addEventListener('open', () => {
      retryMs = MIN_RETRY_MS;
      lastHeard = Date.now();
      heartbeat = window.setInterval(() => {
        if (Date.now() - lastHeard > SILENCE_LIMIT_MS) {
          lose();
          socket.close();
        } else {
          socket.send('ping');
        }
      }, HEARTBEAT_MS);
      onOpen();
    });

    socket.addEventListener('message', (message) => {
      if (current !== socket) return;
      lastHeard = Date.now();
      const event = JSON.parse(message.data);
      if (event.type !== 'pong') onEvent(event);
    });

    socket.addEventListener('close', lose);
  }

  open();
  return { reconnect: () => current?.close() };
}
