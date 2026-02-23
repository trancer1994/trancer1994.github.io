/* ==========================================================
   UI STATE MACHINE
   ========================================================== */

const uiState = {
  connected: false,
  ttConnected: false
};

const ui = {};

ui.enterConnectedState = () => {
  uiState.connected = true;

  const connectBtn = document.getElementById("connect-btn");
  const disconnectBtn = document.getElementById("disconnect-btn");
  const tapToConnect = document.getElementById("tap-to-connect");

  if (connectBtn) connectBtn.style.display = "none";
  if (disconnectBtn) disconnectBtn.style.display = "block";
  if (tapToConnect) tapToConnect.style.display = "none";

  updateBridgeStatus(true);
};

ui.enterDisconnectedState = () => {
  uiState.connected = false;
  uiState.ttConnected = false;

  const connectBtn = document.getElementById("connect-btn");
  const disconnectBtn = document.getElementById("disconnect-btn");
  const tapToConnect = document.getElementById("tap-to-connect");

  if (connectBtn) connectBtn.style.display = "block";
  if (disconnectBtn) disconnectBtn.style.display = "none";
  if (tapToConnect) tapToConnect.style.display = "block";

  updateBridgeStatus(false);
  updateTeamTalkStatus(false);
};


/* ==========================================================
   STATUS INDICATORS
   ========================================================== */

function updateBridgeStatus(connected) {
  const el = document.getElementById("bridge-status");
  if (!el) return;
  el.textContent = connected ? "Bridge: 🟢 Connected" : "Bridge: 🔴 Disconnected";
}

function updateTeamTalkStatus(connected) {
  const el = document.getElementById("tt-status");
  if (!el) return;
  el.textContent = connected ? "TeamTalk: 🟢 Connected" : "TeamTalk: 🔴 Disconnected";
}


/* ==========================================================
   LOGGING (console only)
   ========================================================== */

function logToServerConsole(msg) {
  console.log(msg);
}

function sendToServer(obj) {
  socket.send(JSON.stringify(obj));
}

let currentChannelPath = "/";


/* ==========================================================
   WEBSOCKET CONNECTION
   ========================================================== */

const socket = new WebSocket("wss://connectingworlds-bridge.onrender.com");

logToServerConsole("[UI] Connecting to bridge…");


/* ==========================================================
   TEAMTALK HANDSHAKE
   ========================================================== */

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


/* ==========================================================
   CONNECT BUTTON
   ========================================================== */

window.connectEverything = function () {
  logToServerConsole("[UI] Connect pressed…");

  if (uiState.connected) {
    logToServerConsole("[UI] Bridge already connected. Beginning TeamTalk arc…");
    startTeamTalkHandshake();
    return;
  }

  if (socket.readyState === WebSocket.OPEN) {
    ui.enterConnectedState();
    startTeamTalkHandshake();
  } else {
    logToServerConsole("[UI] Waiting for WebSocket to open…");
  }
};


/* ==========================================================
   DISCONNECT BUTTON
   ========================================================== */

window.disconnectEverything = function () {
  logToServerConsole("[UI] Disconnect pressed…");

  if (socket.readyState === WebSocket.OPEN) {
    sendToServer({ type: "disconnect" });
  }

  ui.enterDisconnectedState();
};


/* ==========================================================
   WEBSOCKET EVENT HANDLERS
   ========================================================== */

socket.onopen = () => {
  updateBridgeStatus(true);

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
    console.error("[Invalid JSON]", event.data);
    return;
  }

  console.log("<<", data);

  switch (data.type) {

    case "status":
      if (data.message === "connected") {
        ui.enterConnectedState();
      }
      break;

    case "handshake-ack":
      console.log("[UI] Handshake ACK:", data.message);
      break;

    case "pong":
      console.log("[UI] Pong received. Server time:", data.serverTime);
      break;

    case "tt-status":
      console.log("[TT]", data.message || data.phase);

      if (data.phase === "connected") updateTeamTalkStatus(true);
      if (data.phase === "disconnected" || data.phase === "error") updateTeamTalkStatus(false);

      break;

    case "tt-channel-list":
      renderChannelList(data.channels || []);
      break;

    case "tt-user-list":
      renderUserList(data.users || []);
      break;

    case "tt-chat":
      appendChatLine(data.from || "TT", data.text || "", data.channel || "");
      break;

    case "tt-current-channel":
      currentChannelPath = data.channel || "/";
      updateCurrentChannelDisplay();
      break;

    case "chat":
      appendChatLine(data.from || "bridge", data.text || "", "[web]");
      break;

    default:
      console.log("[UI] Unhandled message type:", data.type);
      break;
  }
};

socket.onerror = (err) => {
  console.error("[UI] WebSocket error:", err);
};

socket.onclose = () => {
  console.log("[UI] Disconnected from bridge.");
  ui.enterDisconnectedState();
};


/* ==========================================================
   PUBLIC HELPERS
   ========================================================== */

window.requestTeamTalkHandshake = function (options) {
  console.log("[UI] Requesting TeamTalk connection…");

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


/* ==========================================================
   UI RENDERING
   ========================================================== */

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


/* ==========================================================
   CHANNEL CLICK HANDLER
   ========================================================== */

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


/* ==========================================================
   AAC SPEECH HELPERS (kept)
   ========================================================== */

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


/* ==========================================================
   CLEANUP ON UNLOAD
   ========================================================== */

window.addEventListener("beforeunload", () => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "disconnect" }));
  }
});
