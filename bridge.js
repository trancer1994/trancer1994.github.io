/* ==========================================================
   BRIDGE.JS — UNIFIED OPTION 3 (FULL ARCHITECTURE)
   ========================================================== */

/* ----------------------------------------------------------
   CORE STATE + HELPERS
   ---------------------------------------------------------- */

const AppState = {
  // Connection state
  bridgeConnected: false,
  ttConnected: false,

  // User intent
  manualDisconnect: false,

  // Reconnect logic
  reconnectAttempts: 0,
  reconnectDelays: [3000, 10000, 30000],

  // UI behaviour
  soundEnabled: true,
  presenceEnabled: true,
  softFocusCount: 0,

  // Internal lifecycle control
  currentSocketId: 0,
  socket: null,

  // TT handshake timing
  ttHandshakeTimer: null,

  // Channel state
  currentChannelPath: "/",

  // Memory + status speech
  statusSpeechQueue: [],
  conversationMemory: [],
  MAX_MEMORY: 20
};

/* ----------------------------------------------------------
   LOGGING
   ---------------------------------------------------------- */

const Log = {
  ui: (...args) => console.log("[UI]", ...args),
  bridge: (...args) => console.log("[BRIDGE]", ...args),
  tt: (...args) => console.log("[TT]", ...args),
  warn: (...args) => console.warn("[WARN]", ...args),
  error: (...args) => console.error("[ERROR]", ...args),
  raw: (...args) => console.log(...args)
};

/* ----------------------------------------------------------
   SOFT FOCUS + STATUS SPEECH
   ---------------------------------------------------------- */

function enterSoftFocus() {
  AppState.softFocusCount++;
  document.body.classList.add("soft-focus");
}

function exitSoftFocus() {
  AppState.softFocusCount = Math.max(0, AppState.softFocusCount - 1);
  if (AppState.softFocusCount === 0) {
    document.body.classList.remove("soft-focus");
  }
}

function processStatusSpeechQueue() {
  if (!AppState.soundEnabled) {
    AppState.statusSpeechQueue.length = 0;
    return;
  }

  if (!("speechSynthesis" in window)) return;
  if (speechSynthesis.speaking) return;
  if (!AppState.statusSpeechQueue.length) return;

  const text = AppState.statusSpeechQueue.shift();
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
  if (!AppState.soundEnabled) return;
  AppState.statusSpeechQueue.push(text);
  processStatusSpeechQueue();
}

/* ----------------------------------------------------------
   STATE HELPERS
   ---------------------------------------------------------- */

function resetReconnectAttempts() {
  AppState.reconnectAttempts = 0;
}

function incrementSocketId() {
  AppState.currentSocketId++;
  return AppState.currentSocketId;
}

function isStaleSocket(id) {
  return id !== AppState.currentSocketId;
}

function isBridgeConnected() {
  return AppState.bridgeConnected;
}

function isTTConnected() {
  return AppState.ttConnected;
}

function isManualDisconnect() {
  return AppState.manualDisconnect;
}

function setManualDisconnect(flag) {
  AppState.manualDisconnect = flag;
}

/* Stub for optional activity clearing */
function clearChannelActivity() {}

/* ----------------------------------------------------------
   UI CONTROLLER
   ---------------------------------------------------------- */

const UIController = {
  setConnectButtonState(state, label) {
    const btn = document.getElementById("connect-btn");
    if (!btn) return;

    btn.classList.remove("connecting", "connected", "disconnected");
    btn.classList.add(state);

    if (label) btn.textContent = label;
  },

  flashStatusPanel() {
    const panel = document.getElementById("status-panel");
    if (!panel) return;

    panel.classList.add("status-changed");
    setTimeout(() => panel.classList.remove("status-changed"), 250);
  },

  enterConnectedState() {
    AppState.bridgeConnected = true;
    AppState.manualDisconnect = false;

    const connectBtn = document.getElementById("connect-btn");
    const disconnectBtn = document.getElementById("disconnect-btn");

    if (connectBtn) connectBtn.style.display = "none";
    if (disconnectBtn) disconnectBtn.style.display = "block";

    UIController.updateBridgeStatus(true);
    UIController.flashStatusPanel();
    UIController.setConnectButtonState("connected", "Connect");

    UIController.playSound("bridge-connected");
    speakStatus("Bridge connected");
  },

  enterDisconnectedState() {
    AppState.bridgeConnected = false;
    AppState.ttConnected = false;

    const connectBtn = document.getElementById("connect-btn");
    const disconnectBtn = document.getElementById("disconnect-btn");

    if (connectBtn) {
      connectBtn.style.display = "block";
      UIController.setConnectButtonState("disconnected", "Connect");
    }
    if (disconnectBtn) disconnectBtn.style.display = "none";

    UIController.updateBridgeStatus(false);
    UIController.updateTeamTalkStatus(false);
    UIController.flashStatusPanel();

    UIController.playSound("bridge-disconnected");
    speakStatus("Bridge disconnected");
  },

  updateBridgeStatus(connected) {
    const el = document.getElementById("bridge-status");
    if (!el) return;

    el.textContent = connected
      ? "Bridge: 🟢 Connected"
      : "Bridge: 🔴 Disconnected";
  },

  updateTeamTalkStatus(connected) {
    const el = document.getElementById("tt-status");
    if (!el) return;

    el.textContent = connected
      ? "TeamTalk: 🟢 Connected"
      : "TeamTalk: 🔴 Disconnected";
  },

  playSound(name) {
    if (!AppState.soundEnabled) return;

    const el = document.getElementById(`sound-${name}`);
    if (el) {
      el.currentTime = 0;
      el.play().catch(() => {});
    }
  },

  toggleSoundCues() {
    AppState.soundEnabled = !AppState.soundEnabled;

    const btn = document.getElementById("sound-toggle");
    if (btn) {
      btn.textContent = AppState.soundEnabled
        ? "Sound cues: ON"
        : "Sound cues: OFF";
    }
  },

  togglePresenceCues() {
    AppState.presenceEnabled = !AppState.presenceEnabled;

    const btn = document.getElementById("presence-toggle");
    if (btn) {
      btn.textContent = AppState.presenceEnabled
        ? "Presence tones: ON"
        : "Presence tones: OFF";
    }
  },

  appendChatLine(from, text, tag = "") {
    const chat = document.getElementById("chat-log");
    if (!chat) return;

    const line = document.createElement("div");
    line.className = "chat-line";
    line.textContent = `${from}${tag ? " " + tag : ""}: ${text}`;

    chat.appendChild(line);
    chat.scrollTop = chat.scrollHeight;
  },

  renderChannelList(channels) {
    const el = document.getElementById("channel-list");
    if (!el) return;

    el.innerHTML = "";
    (channels || []).forEach((ch) => {
      const li = document.createElement("li");

      if (typeof ch === "string") {
        li.textContent = ch;
      } else if (ch && typeof ch === "object") {
        li.textContent =
          ch.name ||
          ch.path ||
          ch.displayName ||
          ch.id ||
          JSON.stringify(ch);
      } else {
        li.textContent = String(ch);
      }

      el.appendChild(li);
    });
  },

  renderUserList(users) {
    const el = document.getElementById("user-list");
    if (!el) return;

    el.innerHTML = "";
    (users || []).forEach((u) => {
      const li = document.createElement("li");

      if (typeof u === "string") {
        li.textContent = u;
      } else if (u && typeof u === "object") {
        li.textContent =
          u.nickname ||
          u.name ||
          u.username ||
          u.displayName ||
          u.id ||
          JSON.stringify(u);
      } else {
        li.textContent = String(u);
      }

      el.appendChild(li);
    });
  },

  updateCurrentChannelDisplay() {
    const el = document.getElementById("current-channel");
    if (!el) return;
    el.textContent = AppState.currentChannelPath || "/";
  }
};

window.toggleSoundCues = () => UIController.toggleSoundCues();
window.togglePresenceCues = () => UIController.togglePresenceCues();
/* ----------------------------------------------------------
   WEBSOCKET MANAGER (BRIDGE)
   ---------------------------------------------------------- */

const WebSocketManager = {
  connect() {
    Log.ui("Connecting to bridge…");

    AppState.manualDisconnect = false;

    const socketId = incrementSocketId();

    if (AppState.socket && AppState.socket.readyState === WebSocket.OPEN) {
      try {
        AppState.socket.close();
      } catch (_) {}
    }

    const ws = new WebSocket("wss://connectingworlds-bridge.onrender.com");
    AppState.socket = ws;

    ws.onopen = () => {
      if (isStaleSocket(socketId)) return;

      resetReconnectAttempts();
      AppState.bridgeConnected = true;

      UIController.updateBridgeStatus(true);
      UIController.flashStatusPanel();
      UIController.setConnectButtonState("connected", "Connect");

      UIController.playSound("bridge-connected");
      speakStatus("Bridge connected");

      WebSocketManager.send({
        type: "handshake",
        client: "web-ui",
        protocol: 1,
        capabilities: ["chat", "status", "tt-handshake", "ping"],
        timestamp: Date.now()
      });

      AppState.ttHandshakeTimer = setTimeout(() => {
        if (!AppState.manualDisconnect && !isStaleSocket(socketId)) {
          TeamTalkManager.startHandshake();
        }
      }, 250);
    };

    ws.onmessage = (event) => {
      if (isStaleSocket(socketId)) return;

      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        Log.error("Invalid JSON from bridge:", event.data);
        return;
      }

      Log.raw("<<", data);
      MessageRouter.route(data);
    };

    ws.onerror = (err) => {
      if (isStaleSocket(socketId)) return;
      Log.error("WebSocket error:", err);
    };

    ws.onclose = () => {
      if (isStaleSocket(socketId)) return;

      Log.ui("Disconnected from bridge.");

      AppState.bridgeConnected = false;
      AppState.ttConnected = false;

      UIController.updateBridgeStatus(false);
      UIController.updateTeamTalkStatus(false);
      UIController.flashStatusPanel();

      if (!AppState.manualDisconnect) {
        WebSocketManager.scheduleReconnect();
      } else {
        UIController.enterDisconnectedState();
      }
    };
  },

  send(obj) {
    const ws = AppState.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  },

  scheduleReconnect() {
    if (AppState.manualDisconnect) return;

    const attempts = AppState.reconnectAttempts;
    const delays = AppState.reconnectDelays;

    if (attempts >= delays.length) {
      speakStatus("Bridge offline. Please reconnect manually.");
      UIController.setConnectButtonState("disconnected", "Connect");
      return;
    }

    const delay = delays[attempts];
    AppState.reconnectAttempts++;

    speakStatus(`Connection lost. Reconnecting, attempt ${AppState.reconnectAttempts}.`);
    UIController.setConnectButtonState("connecting", "Reconnecting…");

    setTimeout(() => {
      if (navigator && navigator.onLine === false) {
        speakStatus("Offline. Please check your internet connection.");
        UIController.setConnectButtonState("disconnected", "Connect");
        return;
      }

      Log.ui(`Reconnect attempt ${AppState.reconnectAttempts}…`);
      WebSocketManager.connect();
    }, delay);
  },

  forceClose() {
    const ws = AppState.socket;
    if (!ws) return;

    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    } catch (_) {}

    AppState.socket = null;
    incrementSocketId();
  }
};

/* ----------------------------------------------------------
   TEAMTALK MANAGER
   ---------------------------------------------------------- */

const TeamTalkManager = {
  startHandshake() {
    Log.ui("Starting TeamTalk handshake…");
    speakStatus("Connecting to TeamTalk");

    TeamTalkManager.requestHandshake({
      host: tt.seedy.cc,
      port: 10333,
      username: admin,
      password: admin,
      channel: /
    });
  },

  requestHandshake(options) {
    Log.ui("Requesting TeamTalk connection…");

    AppState.currentChannelPath = options.channel || "/";
    UIController.updateCurrentChannelDisplay();

    AppState.ttHandshakeTimer = setTimeout(() => {
      WebSocketManager.send({
        type: "tt-handshake",
        ttHost: options.host,
        ttPort: options.port,
        username: options.username,
        password: options.password,
        channel: options.channel
      });
    }, 200);
  },

  handleStatus(data) {
    let phase = data.phase || data.message;

    if (phase && typeof phase === "object") {
      phase = phase.status || phase.phase || JSON.stringify(phase);
    }

    Log.tt("Status:", phase);

    if (phase === "connected") {
      AppState.ttConnected = true;
      UIController.updateTeamTalkStatus(true);
      UIController.flashStatusPanel();
      UIController.playSound("tt-connected");
      speakStatus("TeamTalk connected");
      return;
    }

    if (phase === "disconnected" || phase === "error") {
      AppState.ttConnected = false;
      UIController.updateTeamTalkStatus(false);
      UIController.flashStatusPanel();
      UIController.playSound("tt-disconnected");
      speakStatus("TeamTalk disconnected");
      return;
    }
  },

  handleChannelList(data) {
    const channels = data.channels || data.list || [];
    Log.tt("Channel list:", channels);
    UIController.renderChannelList(channels);
  },

  handleUserList(data) {
    const users = data.users || data.list || [];
    Log.tt("User list:", users);
    UIController.renderUserList(users);
  },

  handleChat(data) {
    let from = "unknown";

    if (typeof data.from === "string") {
      from = data.from;
    } else if (data.from && typeof data.from === "object") {
      from =
        data.from.nickname ||
        data.from.name ||
        data.from.username ||
        data.from.displayName ||
        "unknown";
    }

    const text = data.text || "";
    Log.tt("Chat:", { from, text });
    UIController.appendChatLine(from, text, "[tt]");
  },

  handleCurrentChannel(data) {
    AppState.currentChannelPath = data.channel || data.path || "/";
    UIController.updateCurrentChannelDisplay();
    clearChannelActivity(AppState.currentChannelPath);
  },

  forceDisconnect() {
    AppState.ttConnected = false;
    UIController.updateTeamTalkStatus(false);

    if (AppState.ttHandshakeTimer) {
      clearTimeout(AppState.ttHandshakeTimer);
      AppState.ttHandshakeTimer = null;
    }
  }
};

window.requestTeamTalkHandshake = (options) =>
  TeamTalkManager.requestHandshake(options);

window.sendTeamTalkChat = function () {
  const input = document.getElementById("chat-input");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  WebSocketManager.send({
    type: "tt-chat",
    channel: AppState.currentChannelPath,
    text
  });

  input.value = "";
};
/* ----------------------------------------------------------
   MESSAGE ROUTER
   ---------------------------------------------------------- */

const MessageRouter = {
  route(msg) {
    switch (msg.type) {
      case "status":
        if (msg.message === "connected") {
          UIController.enterConnectedState();
        }
        break;

      case "handshake-ack":
        Log.ui("Handshake ACK:", msg.message);
        break;

      case "pong":
        Log.bridge("Pong received. Server time:", msg.serverTime);
        break;

      case "tt-status":
        TeamTalkManager.handleStatus(msg);
        break;

      case "tt-channel-list":
        TeamTalkManager.handleChannelList(msg);
        break;

      case "tt-user-list":
        TeamTalkManager.handleUserList(msg);
        break;

      case "tt-chat":
        TeamTalkManager.handleChat(msg);
        break;

      case "tt-current-channel":
        TeamTalkManager.handleCurrentChannel(msg);
        break;

      case "chat":
        UIController.appendChatLine(
          msg.from || "bridge",
          msg.text || "",
          "[web]"
        );
        break;

      default:
        Log.warn("Unhandled message type:", msg.type, msg);
        break;
    }
  }
};

/* ----------------------------------------------------------
   FORCED TEARDOWN ENGINE
   ---------------------------------------------------------- */

const ForcedTeardownEngine = {
  run() {
    Log.ui("Forcing full teardown…");

    AppState.manualDisconnect = true;
    AppState.reconnectAttempts = 0;

    WebSocketManager.forceClose();
    incrementSocketId();

    TeamTalkManager.forceDisconnect();

    UIController.enterDisconnectedState();
  }
};

/* ----------------------------------------------------------
   PUBLIC API + BUTTON BINDINGS
   ---------------------------------------------------------- */

window.connectEverything = function () {
  Log.ui("Connect pressed…");

  AppState.manualDisconnect = false;

  UIController.setConnectButtonState("connecting", "Connecting…");
  speakStatus("Connecting to bridge");

  if (!AppState.socket || AppState.socket.readyState === WebSocket.CLOSED) {
    WebSocketManager.connect();
    return;
  }

  if (isBridgeConnected() && isTTConnected()) {
    speakStatus("Already connected");
    return;
  }

  if (AppState.socket.readyState === WebSocket.OPEN) {
    UIController.enterConnectedState();
    TeamTalkManager.startHandshake();
  } else {
    speakStatus("Connecting to bridge");
  }
};

window.disconnectEverything = function () {
  Log.ui("Disconnect pressed…");

  try {
    WebSocketManager.send({ type: "disconnect" });
  } catch (_) {}

  ForcedTeardownEngine.run();
};

window.sendChatMessage = function (from, text) {
  WebSocketManager.send({
    type: "chat",
    from,
    text
  });
};
