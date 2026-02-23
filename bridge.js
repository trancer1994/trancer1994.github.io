/* ==========================================================
   UI STATE MACHINE
   ========================================================== */

const uiState = {
  connected: false,
  ttConnected: false,
  soundEnabled: true,
  presenceEnabled: true,
  manualDisconnect: false,
  softFocusCount: 0
};

const ui = {};

function setConnectButtonState(state, label) {
  const btn = document.getElementById("connect-btn");
  if (!btn) return;
  btn.classList.remove("connecting", "connected", "disconnected");
  btn.classList.add(state);
  if (label) btn.textContent = label;
}

function flashStatusPanel() {
  const panel = document.getElementById("status-panel");
  if (!panel) return;
  panel.classList.add("status-changed");
  setTimeout(() => panel.classList.remove("status-changed"), 250);
}

ui.enterConnectedState = () => {
  uiState.connected = true;
  uiState.manualDisconnect = false;

  const connectBtn = document.getElementById("connect-btn");
  const disconnectBtn = document.getElementById("disconnect-btn");

  if (connectBtn) connectBtn.style.display = "none";
  if (disconnectBtn) disconnectBtn.style.display = "block";

  updateBridgeStatus(true);
  flashStatusPanel();
  setConnectButtonState("connected", "Connect");
  playSound("bridge-connected");
  speakStatus("Bridge connected");
};

ui.enterDisconnectedState = () => {
  uiState.connected = false;
  uiState.ttConnected = false;

  const connectBtn = document.getElementById("connect-btn");
  const disconnectBtn = document.getElementById("disconnect-btn");

  if (connectBtn) {
    connectBtn.style.display = "block";
    setConnectButtonState("disconnected", "Connect");
  }
  if (disconnectBtn) disconnectBtn.style.display = "none";

  updateBridgeStatus(false);
  updateTeamTalkStatus(false);
  flashStatusPanel();

  playSound("bridge-disconnected");
  speakStatus("Bridge disconnected");
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
   SOUND CUES
   ========================================================== */

function playSound(name) {
  if (!uiState.soundEnabled) return;

  const el = document.getElementById(`sound-${name}`);
  if (el) {
    el.currentTime = 0;
    el.play().catch(() => {});
  }
}

window.toggleSoundCues = function () {
  uiState.soundEnabled = !uiState.soundEnabled;

  const btn = document.getElementById("sound-toggle");
  if (btn) {
    btn.textContent = uiState.soundEnabled ? "Sound cues: ON" : "Sound cues: OFF";
  }
};

window.togglePresenceCues = function () {
  uiState.presenceEnabled = !uiState.presenceEnabled;

  const btn = document.getElementById("presence-toggle");
  if (btn) {
    btn.textContent = uiState.presenceEnabled ? "Presence tones: ON" : "Presence tones: OFF";
  }
};


/* ==========================================================
   SOFT FOCUS MODE
   ========================================================== */

function enterSoftFocus() {
  uiState.softFocusCount++;
  document.body.classList.add("soft-focus");
}

function exitSoftFocus() {
  uiState.softFocusCount = Math.max(0, uiState.softFocusCount - 1);
  if (uiState.softFocusCount === 0) {
    document.body.classList.remove("soft-focus");
  }
}


/* ==========================================================
   STATUS SPEECH (QUEUED, NON-INTERRUPTING)
   ========================================================== */

const statusSpeechQueue = [];

function processStatusSpeechQueue() {
  if (!uiState.soundEnabled) {
    statusSpeechQueue.length = 0;
    return;
  }

  if (!("speechSynthesis" in window)) return;
  if (speechSynthesis.speaking) return;
  if (!statusSpeechQueue.length) return;

  const text = statusSpeechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  utterance.onstart = () => enterSoftFocus();
  utterance.onend = () => {
    exitSoftFocus();
    setTimeout(processStatusSpeechQueue, 50);
  };

  speechSynthesis.speak(utterance);
}

function speakStatus(text) {
  if (!uiState.soundEnabled) return;
  statusSpeechQueue.push(text);
  processStatusSpeechQueue();
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
   WEBSOCKET CONNECTION + AUTO-RECONNECT
   ========================================================== */

let socket = createSocket();
let reconnectAttempts = 0;
const reconnectDelays = [3000, 10000, 30000]; // ms

function createSocket() {
  const ws = new WebSocket("wss://connectingworlds-bridge.onrender.com");
  logToServerConsole("[UI] Connecting to bridge…");
  attachSocketHandlers(ws);
  return ws;
}

function scheduleReconnect() {
  if (uiState.manualDisconnect) return;
  if (reconnectAttempts >= reconnectDelays.length) {
    speakStatus("Bridge offline. Please reconnect manually.");
    setConnectButtonState("disconnected", "Connect");
    return;
  }

  const delay = reconnectDelays[reconnectAttempts];
  reconnectAttempts += 1;

  speakStatus(`Connection lost. Reconnecting, attempt ${reconnectAttempts}.`);
  setConnectButtonState("connecting", "Reconnecting…");

  setTimeout(() => {
    if (navigator && navigator.onLine === false) {
      speakStatus("Offline. Please check your internet connection.");
      setConnectButtonState("disconnected", "Connect");
      return;
    }

    logToServerConsole(`[UI] Reconnect attempt ${reconnectAttempts}…`);
    socket = createSocket();
  }, delay);
}


/* ==========================================================
   TEAMTALK HANDSHAKE
   ========================================================== */

function startTeamTalkHandshake() {
  logToServerConsole("[UI] Starting TeamTalk handshake…");
  speakStatus("Connecting to TeamTalk");

  requestTeamTalkHandshake({
    host: "tt.seedy.cc",
    port: 10333,
    username: "admin",
    password: "admin",
    channel: "/"
  });
}


/* ==========================================================
   CONNECT / DISCONNECT BUTTONS
   ========================================================== */

window.connectEverything = function () {
  logToServerConsole("[UI] Connect pressed…");
  uiState.manualDisconnect = false;

  const btn = document.getElementById("connect-btn");
  if (btn) setConnectButtonState("connecting", "Reconnecting…");

  if (uiState.connected) {
    startTeamTalkHandshake();
    return;
  }

  if (socket.readyState === WebSocket.OPEN) {
    ui.enterConnectedState();
    startTeamTalkHandshake();
  } else {
    logToServerConsole("[UI] Waiting for WebSocket to open…");
    speakStatus("Connecting to bridge");
  }
};

window.disconnectEverything = function () {
  logToServerConsole("[UI] Disconnect pressed…");
  uiState.manualDisconnect = true;
  reconnectAttempts = 0;

  if (socket && socket.readyState === WebSocket.OPEN) {
    sendToServer({ type: "disconnect" });
  }

  ui.enterDisconnectedState();
};


/* ==========================================================
   SOCKET HANDLERS
   ========================================================== */

function attachSocketHandlers(ws) {
  ws.onopen = () => {
    reconnectAttempts = 0;
    updateBridgeStatus(true);
    flashStatusPanel();
    setConnectButtonState("connected", "Connect");
    playSound("bridge-connected");
    speakStatus("Bridge connected");

    sendToServer({
      type: "handshake",
      client: "web-ui",
      protocol: 1,
      capabilities: ["chat", "status", "tt-handshake", "ping"],
      timestamp: Date.now()
    });
  };

  ws.onmessage = (event) => {
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

        if (data.phase === "connected") {
          uiState.ttConnected = true;
          updateTeamTalkStatus(true);
          flashStatusPanel();
          playSound("tt-connected");
          speakStatus("TeamTalk connected");
        }

        if (data.phase === "disconnected" || data.phase === "error") {
          uiState.ttConnected = false;
          updateTeamTalkStatus(false);
          flashStatusPanel();
          playSound("tt-disconnected");
          speakStatus("TeamTalk disconnected");
        }

        break;

      case "tt-channel-list":
        renderChannelList(data.channels || []);
        break;

      case "tt-user-list":
        renderUserList(data.users || []);
        break;

      case "tt-chat":
        handleTeamTalkChat(data);
        break;

      case "tt-current-channel":
        currentChannelPath = data.channel || "/";
        updateCurrentChannelDisplay();
        clearChannelActivity(currentChannelPath);
        break;

      case "chat":
        appendChatLine(data.from || "bridge", data.text || "", "[web]");
        break;

      default:
        console.log("[UI] Unhandled message type:", data.type);
        break;
    }
  };

  ws.onerror = (err) => {
    console.error("[UI] WebSocket error:", err);
  };

  ws.onclose = () => {
    console.log("[UI] Disconnected from bridge.");
    updateBridgeStatus(false);
    updateTeamTalkStatus(false);
    flashStatusPanel();

    if (!uiState.manualDisconnect) {
      scheduleReconnect();
    } else {
      ui.enterDisconnectedState();
    }
  };
}


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
   CONVERSATION MEMORY (Chapter 8)
   ========================================================== */

const conversationMemory = [];
const MAX_MEMORY = 20;

function addToConversationMemory(from, text, channel) {
  conversationMemory.push({
    from,
    text,
    channel,
    timestamp: Date.now()
  });
  if (conversationMemory.length > MAX_MEMORY) {
    conversationMemory.shift();
  }
  renderConversationMemory();
}

function renderConversationMemory() {
  const panel = document.getElementById("conversation-memory");
  if (!panel) return;

  panel.innerHTML = "";
  for (const item of conversationMemory) {
    const div = document.createElement("div");
    const chLabel = item.channel ? `[${item.channel}] ` : "";
    div.textContent = `${chLabel}${item.from}: ${item.text}`;
    panel.appendChild(div);
  }
}


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

function handleTeamTalkChat(data) {
  const from = data.from || "TT";
  const text = data.text || "";
  const channel = data.channel || "";

  appendChatLine(from, text, channel);
  addToConversationMemory(from, text, channel);

  if (channel && channel !== currentChannelPath) {
    markChannelActivity(channel);
  }
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
    const path = ch.path || ch.name || "/";
    const depth = path === "/" ? 0 : path.split("/").filter(Boolean).length;

    li.textContent = path;
    li.dataset.channelPath = path;
    li.className = "channel-item";
    li.style.paddingLeft = `${depth * 16}px`;

    if (path === currentChannelPath) {
      li.classList.add("current-channel");
    }

    list.appendChild(li);
  }
}

let lastUserNicknames = new Set();

function renderUserList(users) {
  const list = document.getElementById("user-list");
  if (!list) return;

  const relevant = users.filter(u => !!u.nickname);
  const newSet = new Set(relevant.map(u => u.nickname));

  if (uiState.presenceEnabled) {
    for (const nick of newSet) {
      if (!lastUserNicknames.has(nick)) {
        playSound("presence-join");
        speakStatus("Someone joined the channel.");
        break;
      }
    }
    for (const nick of lastUserNicknames) {
      if (!newSet.has(nick)) {
        playSound("presence-leave");
        speakStatus("Someone left the channel.");
        break;
      }
    }
  }

  lastUserNicknames = newSet;

  list.innerHTML = "";

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

  const list = document.getElementById("channel-list");
  if (!list) return;
  const items = list.querySelectorAll(".channel-item");
  items.forEach(item => {
    if (item.dataset.channelPath === currentChannelPath) {
      item.classList.add("current-channel");
      item.classList.remove("channel-has-activity");
    } else {
      item.classList.remove("current-channel");
    }
  });
}


/* ==========================================================
   NEW ACTIVITY MARKERS (Chapter 6)
   ========================================================== */

function markChannelActivity(path) {
  const list = document.getElementById("channel-list");
  if (!list) return;
  const items = list.querySelectorAll(".channel-item");
  items.forEach(item => {
    if (item.dataset.channelPath === path && path !== currentChannelPath) {
      item.classList.add("channel-has-activity");
    }
  });
}

function clearChannelActivity(path) {
  const list = document.getElementById("channel-list");
  if (!list) return;
  const items = list.querySelectorAll(".channel-item");
  items.forEach(item => {
    if (item.dataset.channelPath === path) {
      item.classList.remove("channel-has-activity");
    }
  });
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
    clearChannelActivity(path);
    setAdaptiveMode("channels");

    sendToServer({
      type: "tt-join",
      channel: path
    });
  }

  if (target.classList.contains("aac-button")) {
    setAdaptiveMode("aac");
  }
});

const chatInput = document.getElementById("chat-input");
if (chatInput) {
  chatInput.addEventListener("focus", () => setAdaptiveMode("chat"));
}


/* ==========================================================
   AAC SPEECH HELPERS (kept, with soft focus)
   ========================================================== */

window.speakText = function (text) {
  if (!text || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.onstart = () => enterSoftFocus();
  utterance.onend = () => {
    exitSoftFocus();
    setTimeout(processStatusSpeechQueue, 50);
  };
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
   AAC QUICK PHRASES (Chapter 9)
   ========================================================== */

window.sendQuickPhrase = function (text) {
  if (!text) return;
  const input = document.getElementById("chat-input");
  if (input) {
    input.value = text;
  }
  window.speakText(text);
};


/* ==========================================================
   ADAPTIVE LAYOUT (Chapter 10)
   ========================================================== */

function setAdaptiveMode(mode) {
  document.body.classList.remove("mode-chat", "mode-channels", "mode-aac");
  if (mode === "chat") document.body.classList.add("mode-chat");
  if (mode === "channels") document.body.classList.add("mode-channels");
  if (mode === "aac") document.body.classList.add("mode-aac");
}


/* ==========================================================
   CLEANUP ON UNLOAD
   ========================================================== */

window.addEventListener("beforeunload", () => {
  uiState.manualDisconnect = true;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "disconnect" }));
  }
});
