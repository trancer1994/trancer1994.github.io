// ==========================================================
// UI CONSOLE HELPERS
// ==========================================================

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


// ==========================================================
// WEBSOCKET CONNECTION (ENGINE)
// ==========================================================

// Auto-connect WebSocket on page load
const socket = new WebSocket("wss://connectingworlds-bridge.onrender.com");

logToServerConsole("[UI] Connecting to bridge…");


// ==========================================================
// TEAMTALK HANDSHAKE HELPER
// ==========================================================

function startTeamTalkHandshake() {
  logToServerConsole("[UI] Starting TeamTalk handshake…");

  requestTeamTalkHandshake({
    host: "tt.seedy.cc",
    port: 10333,
    username: "admin",
    password: "admin",
    channel: "/"
  });
}


// ==========================================================
// UNIFIED CONNECT BUTTON (RITUAL)
// ==========================================================

window.connectEverything = function () {
  logToServerConsole("[UI] Connect pressed…");

  if (socket.readyState === WebSocket.OPEN) {
    logToServerConsole("[UI] Bridge already connected. Beginning TeamTalk arc…");
    startTeamTalkHandshake();
  } else {
    logToServerConsole("[UI] Waiting for WebSocket to open…");
  }
};


// ==========================================================
// WEBSOCKET EVENT HANDLERS
// ==========================================================

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

  // --------------------------------------------------------
  // ROUTING
  // --------------------------------------------------------

  if (data.type === "handshake-ack") {
    logToServerConsole("[UI] Handshake ACK from bridge: " + (data.message || ""));
    // DO NOT auto-start TeamTalk here — Option 2 requires user ritual
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
    appendChatLine(data.from || "bridge", data.text || "", "[web]");
    return;
  }

  logToServerConsole("[UI] Unhandled message type: " + data.type);
};

socket.onerror = (err) => {
  logToServerConsole("[UI] WebSocket error (see browser console).");
  console.error("WebSocket error:", err);
};

socket.onclose = () => {
  logToServerConsole("[UI] Disconnected from bridge.");
};


// ==========================================================
// PUBLIC HELPERS (EXPOSED ON WINDOW)
// ==========================================================

window.requestTeamTalkHandshake = function (options) {
  logToServerConsole("[UI] Requesting TeamTalk connection…");

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

window.sendChatMessage = function (from, text) {
  sendToServer({
    type: "chat",
    from: from,
    text: text
  });
  logToServerConsole("[UI] Sent chat message from " + from);
};

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


// ==========================================================
// UI RENDERING HELPERS
// ==========================================================

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


// ==========================================================
// CHANNEL CLICK HANDLER
// ==========================================================

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


// ==========================================================
// AAC SPEECH HELPERS
// ==========================================================

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
