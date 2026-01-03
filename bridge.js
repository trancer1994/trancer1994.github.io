// === UI CONSOLE HELPERS ===================================

function logToServerConsole(msg) {
  const box = document.getElementById("server-console");
  if (!box) return;

  const line = document.createElement("div");
  line.textContent = msg;

  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function sendToServer(obj) {
  const json = JSON.stringify(obj);
  logToServerConsole(">> " + json);
  socket.send(json);
}

// === WEBSOCKET CONNECTION =================================

// Important: socket is defined after the helpers so they can use it.
const socket = new WebSocket("wss://connectingworlds-bridge.onrender.com");

logToServerConsole("[UI] Connecting to bridge…");

socket.onopen = () => {
  logToServerConsole("[UI] Bridge connected. Sending handshake…");

  sendToServer({
    type: "handshake",
    client: "web-ui",
    protocol: 1,
    capabilities: ["chat", "status", "tt-handshake", "ping"],
    timestamp: Date.now()
  });
};

socket.onmessage = (event) => {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch (e) {
    logToServerConsole("<< [Invalid JSON] " + event.data);
    return;
  }

  logToServerConsole("<< " + JSON.stringify(data));

  // --- ROUTING BY MESSAGE TYPE ---------------------------

  if (data.type === "handshake-ack") {
    logToServerConsole("[UI] Handshake ACK from bridge: " + (data.message || ""));

    // OPTIONAL: automatically request a TeamTalk connection here.
    // You can change these values or trigger this from a button instead.
    /*
    window.requestTeamTalkHandshake({
      host: "your.tt.server",
      port: 10333,
      username: "Jamie",
      password: "secret",
      channel: "Lobby"
    });
    */

    return;
  }

  if (data.type === "pong") {
    logToServerConsole("[UI] Pong received. Server time: " + data.serverTime);
    return;
  }

  if (data.type === "tt-status") {
    // All TeamTalk bridge status updates arrive here
    logToServerConsole("[TT] " + (data.message || data.phase || "status"));
    // You can add extra UI updates here later (e.g., show connection state)
    return;
  }

  if (data.type === "chat") {
    // Basic chat display hook
    logToServerConsole("[CHAT] " + (data.from || "bridge") + ": " + data.text);
    return;
  }

  // Unknown message type
  logToServerConsole("[UI] Unhandled message type: " + data.type);
};

socket.onerror = (err) => {
  logToServerConsole("[UI] WebSocket error (see browser console for details).");
  console.error("WebSocket error:", err);
};

socket.onclose = () => {
  logToServerConsole("[UI] Disconnected from bridge.");
};

// === PUBLIC HELPERS (EXPOSED ON WINDOW) ===================

// TeamTalk handshake request – can be called from buttons, etc.
window.requestTeamTalkHandshake = function (options) {
  logToServerConsole("[UI] Requesting TeamTalk connection…");

  sendToServer({
    type: "tt-handshake",
    ttHost: options.host,
    ttPort: options.port,
    username: options.username,
    password: options.password,
    channel: options.channel
  });
};

// Simple ping helper if you want to test latency / liveness
window.sendPingToBridge = function () {
  sendToServer({
    type: "ping",
    timestamp: Date.now()
  });
  logToServerConsole("[UI] Sent ping to bridge.");
};

// Simple chat helper; you can wire this to a text input
window.sendChatMessage = function (from, text) {
  sendToServer({
    type: "chat",
    from: from,
    text: text
  });
  logToServerConsole("[UI] Sent chat message from " + from);
};
