// Connect to your Render WebSocket server
const socket = new WebSocket("wss://connectingworlds-bridge.onrender.com");

// Connection opened
socket.onopen = () => {
  console.log("Connected to Connecting Worlds bridge");

  // Send structured handshake
  socket.send(JSON.stringify({
    type: "handshake",
    client: "web-ui",
    protocol: 1,
    capabilities: ["chat", "status", "tt-handshake", "ping"],
    timestamp: Date.now()
  }));
};

// Handle incoming messages
socket.onmessage = (event) => {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch (e) {
    console.error("Invalid JSON from server:", event.data);
    return;
  }

  console.log("Received:", data);

  // Handshake acknowledgement
  if (data.type === "handshake-ack") {
    console.log("[Handshake ACK]", data.message);
    return;
  }

  // Bridge/server status messages
  if (data.type === "status") {
    console.log("[Bridge status]", data.message);
    return;
  }

  // TeamTalk status updates
  if (data.type === "tt-status") {
    console.log("[TeamTalk status]", data.message || data.phase, data);
    return;
  }

  // Pong response (latency check)
  if (data.type === "pong") {
    const latency = Date.now() - (data.sentAt || Date.now());
    console.log("[Pong] latency approx:", latency, "ms");
    return;
  }

  // Chat messages
  if (data.type === "chat") {
    console.log("[Chat]", `${data.from}: ${data.text}`);
    return;
  }

  // Unknown message type
  console.log("[Unknown message type]", data.type, data);
};

// Connection closed
socket.onclose = () => {
  console.log("Disconnected from Connecting Worlds bridge");
};

// Error handler
socket.onerror = (err) => {
  console.error("WebSocket error:", err);
};

// Helper: send chat messages
window.sendMessage = function(text, from = "web") {
  socket.send(JSON.stringify({
    type: "chat",
    from,
    text
  }));
};

// Helper: send ping (manual latency check)
window.sendPing = function() {
  socket.send(JSON.stringify({
    type: "ping",
    timestamp: Date.now()
  }));
};

// Helper: request TeamTalk handshake (future integration)
window.requestTeamTalkHandshake = function(options) {
  socket.send(JSON.stringify({
    type: "tt-handshake",
    ttHost: options.host,
    ttPort: options.port,
    username: options.username,
    password: options.password,
    channel: options.channel
  }));
};
