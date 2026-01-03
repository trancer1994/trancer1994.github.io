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

// Track current channel on the UI side
let currentChannelPath = "/";

// === WEBSOCKET CONNECTION =================================

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
    return;
  }

  if (data.type === "pong") {
    logToServerConsole("[UI] Pong received. Server time: " + data.serverTime);
    return;
  }

  if (data.type === "tt-status") {
    logToServerConsole("[TT] " + (data.message || data.phase || "status"));
    return;
  }

  if (data.type === "tt-channel-list") {
    renderChannelList(data.channels || []);
    return;
  }

  if (data.type === "tt-user-list") {
    renderUserList(data.users || []);
    return;
  }

  if (data.type === "tt-chat") {
    appendChatLine(data.from || "TT", data.text || "", data.channel || "");
    return;
  }

  if (data.type === "tt-current-channel") {
    currentChannelPath = data.channel || "/";
    updateCurrentChannelDisplay();
    return;
  }

  if (data.type === "chat") {
    // Web-only chat
    appendChatLine(data.from || "bridge", data.text || "", "[web]");
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

window.requestTeamTalkHandshake = function (options) {
  logToServerConsole("[UI] Requesting TeamTalk connection…");

  // Optimistically set the current channel to whatever we're requesting
  currentChannelPath = options.channel || "/";
  updateCurrentChannelDisplay();

  sendToServer({
    type: "tt-handshake",
    ttHost: options.host,
    ttPort: options.port,
    username: options.username,
    password: options.password,
    channel: options.channel
  });
};

window.sendPingToBridge = function () {
  sendToServer({
    type: "ping",
    timestamp: Date.now()
  });
  logToServerConsole("[UI] Sent ping to bridge.");
};

window.sendChatMessage = function (from, text) {
  sendToServer({
    type: "chat",
    from: from,
    text: text
  });
  logToServerConsole("[UI] Sent chat message from " + from);
};

// Chat helper specifically for TeamTalk channel chat
window.sendTeamTalkChat = function () {
  const input = document.getElementById("chat-input");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  sendToServer({
    type: "tt-chat",
    channel: currentChannelPath,
    text
  });

  input.value = "";
};

// Allow AAC "Connect" button to just send a ping / no-op
window.connectToBridge = function () {
  // The WebSocket auto-connects on page load
  // So here we just send a ping to confirm liveness
  window.sendPingToBridge();
};

// === UI RENDERING HELPERS ================================

function appendChatLine(from, text, channelLabel) {
  const chatBox = document.getElementById("chat");
  if (!chatBox) return;

  const p = document.createElement("p");
  const prefix = channelLabel ? `[${channelLabel}] ` : "";
  p.textContent = `${prefix}${from}: ${text}`;

  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function renderChannelList(channels) {
  const list = document.getElementById("channel-list");
  if (!list) return;

  list.innerHTML = "";

  if (!channels.length) {
    const li = document.createElement("li");
    li.textContent = "[No channels]";
    list.appendChild(li);
    return;
  }

  // Sort by path for stability
  channels.sort((a, b) => (a.path || a.name || "").localeCompare(b.path || b.name || ""));

  for (const ch of channels) {
    const li = document.createElement("li");
    li.textContent = ch.path || ch.name || "/";
    li.dataset.channelPath = ch.path || "/";
    li.className = "channel-item";
    list.appendChild(li);
  }
}

function renderUserList(users) {
  const list = document.getElementById("user-list");
  if (!list) return;

  list.innerHTML = "";

  const relevant = users.filter(u => !!u.nickname);

  if (!relevant.length) {
    const li = document.createElement("li");
    li.textContent = "[No users yet]";
    list.appendChild(li);
    return;
  }

  for (const u of relevant) {
    const li = document.createElement("li");
    li.textContent = u.nickname + (u.username && u.username !== u.nickname ? ` (${u.username})` : "");
    list.appendChild(li);
  }
}

function updateCurrentChannelDisplay() {
  const el = document.getElementById("current-channel-label");
  if (el) {
    el.textContent = currentChannelPath || "/";
  }
}

// Channel click handler
document.addEventListener("click", (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.classList.contains("channel-item")) {
    const path = target.dataset.channelPath || "/";
    currentChannelPath = path;
    updateCurrentChannelDisplay();

    sendToServer({
      type: "tt-join",
      channel: path
    });
  }
});

// === AAC / SPEECH HELPERS ================================

window.speakText = function (text) {
  if (!text || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
};

window.startSpeechToText = function () {
  const input = document.getElementById("chat-input");
  if (!input) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition is not supported in this browser.");
    return;
  }

  const recog = new SpeechRecognition();
  recog.lang = "en-GB";
  recog.interimResults = false;
  recog.maxAlternatives = 1;

  recog.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
  };

  recog.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };

  recog.start();
};
