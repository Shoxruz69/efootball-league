const { WebSocketServer } = require('ws');

let wss = null;

function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'subscribe_match') {
          ws.matchId = data.matchId;
        }
      } catch (e) {
        // ignore invalid json
      }
    });

    // Send connection established confirmation
    ws.send(JSON.stringify({ type: 'connected', time: Date.now() }));
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
}

function broadcast(data) {
  if (!wss) return;
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  });
}

function broadcastMatchEvent(matchId, eventData) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'match_event', matchId, ...eventData });
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && (client.matchId === matchId || !client.matchId)) {
      client.send(payload);
    }
  });
}

module.exports = {
  initWebSocket,
  broadcast,
  broadcastMatchEvent
};
