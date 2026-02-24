/* ==========================================================
   MODULE 1 — CORE STATE MACHINE + LIFECYCLE CONTROLLER
   ========================================================== */

/**
 * Centralised application state.
 * This replaces scattered booleans with a single authoritative source of truth.
 */
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

  // Memory + status speech
  statusSpeechQueue: [],
  conversationMemory: [],
  MAX_MEMORY: 20
};

/* ==========================================================
   SOFT FOCUS MODE
   ========================================================== */

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

/* ==========================================================
   STATUS SPEECH (QUEUED, NON-INTERRUPTING)
   ========================================================== */

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

/* ==========================================================
   LIFECYCLE HELPERS
   ========================================================== */

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

/* ==========================================================
   PUBLIC STATE GETTERS
   ========================================================== */

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
/* ==========================================================
   MODULE 2 — UI CONTROLLER
   ========================================================== */

/**
 * The UIController centralises all DOM updates, sound cues,
 * status indicators, and user‑visible state transitions.
 *
 * This replaces scattered UI helpers with a clean, predictable API.
 */
const UIController = {
  /* ----------------------------------------------------------
     BUTTON STATE
     ---------------------------------------------------------- */
  setConnectButtonState(state, label) {
    const btn = document.getElementById("connect-btn");
    if (!btn) return;

    btn.classList.remove("connecting", "connected", "disconnected");
    btn.classList.add(state);

    if (label) btn.textContent = label;
  },

  /* ----------------------------------------------------------
     STATUS PANEL FLASH
     ---------------------------------------------------------- */
  flashStatusPanel() {
    const panel = document.getElementById("status-panel");
    if (!panel) return;

    panel.classList.add("status-changed");
    setTimeout(() => panel.classList.remove("status-changed"), 250);
  },

  /* ----------------------------------------------------------
     ENTER CONNECTED STATE
     ---------------------------------------------------------- */
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

  /* ----------------------------------------------------------
     ENTER DISCONNECTED STATE
     ---------------------------------------------------------- */
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

  /* ----------------------------------------------------------
     STATUS INDICATORS
     ---------------------------------------------------------- */
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

  /* ----------------------------------------------------------
     SOUND CUES
     ---------------------------------------------------------- */
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

  /* ----------------------------------------------------------
     CHAT UI HELPERS
     ---------------------------------------------------------- */
  appendChatLine(from, text, tag = "") {
    const chat = document.getElementById("chat-log");
    if (!chat) return;

    const line = document.createElement("div");
    line.className = "chat-line";
    line.textContent = `${from}${tag ? " " + tag : ""}: ${text}`;

    chat.appendChild(line);
    chat.scrollTop = chat.scrollHeight;
  },

  /* ----------------------------------------------------------
     CHANNEL + USER LIST HELPERS
     ---------------------------------------------------------- */
  renderChannelList(channels) {
    const el = document.getElementById("channel-list");
    if (!el) return;

    el.innerHTML = "";
    channels.forEach((ch) => {
      const li = document.createElement("li");
      li.textContent = ch;
      el.appendChild(li);
    });
  },

  renderUserList(users) {
    const el = document.getElementById("user-list");
    if (!el) return;

    el.innerHTML = "";
    users.forEach((u) => {
      const li = document.createElement("li");
      li.textContent = u;
      el.appendChild(li);
    });
  }
};

/* Expose toggles globally for your existing HTML buttons */
window.toggleSoundCues = () => UIController.toggleSoundCues();
window.togglePresenceCues = () => UIController.togglePresenceCues();
/* ==========================================================
   MODULE 3 — WEBSOCKET MANAGER (BRIDGE)
   ========================================================== */

/**
 * WebSocketManager handles:
 * - connecting to the bridge
 * - reconnect logic
 * - stale-socket protection
 * - message dispatch
 * - integration with forced teardown
 */
const WebSocketManager = {
  connect() {
    console.log("[UI] Connecting to bridge…");

    // Reset manual disconnect intent
    AppState.manualDisconnect = false;

    // Increment socket ID to invalidate old events
    const socketId = incrementSocketId();

    // Close any existing socket cleanly
    if (AppState.socket && AppState.socket.readyState === WebSocket.OPEN) {
      try {
        AppState.socket.close();
      } catch (_) {}
    }

    const ws = new WebSocket("wss://connectingworlds-bridge.onrender.com");
    AppState.socket = ws;

    /* ----------------------------------------------------------
       ON OPEN
       ---------------------------------------------------------- */
    ws.onopen = () => {
      if (isStaleSocket(socketId)) return;

      AppState.reconnectAttempts = 0;
      AppState.bridgeConnected = true;

      UIController.updateBridgeStatus(true);
      UIController.flashStatusPanel();
      UIController.setConnectButtonState("connected", "Connect");

      UIController.playSound("bridge-connected");
      speakStatus("Bridge connected");

      // Initial handshake
      WebSocketManager.send({
        type: "handshake",
        client: "web-ui",
        protocol: 1,
        capabilities: ["chat", "status", "tt-handshake", "ping"],
        timestamp: Date.now()
      });

      // Delay TT handshake slightly to avoid race conditions
      AppState.ttHandshakeTimer = setTimeout(() => {
        if (!AppState.manualDisconnect && !isStaleSocket(socketId)) {
          TeamTalkManager.startHandshake();
        }
      }, 250);
    };

    /* ----------------------------------------------------------
       ON MESSAGE
       ---------------------------------------------------------- */
    ws.onmessage = (event) => {
      if (isStaleSocket(socketId)) return;

      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        console.error("[Invalid JSON]", event.data);
        return;
      }

      console.log("<<", data);
      MessageRouter.route(data);
    };

    /* ----------------------------------------------------------
       ON ERROR
       ---------------------------------------------------------- */
    ws.onerror = (err) => {
      if (isStaleSocket(socketId)) return;
      console.error("[UI] WebSocket error:", err);
    };

    /* ----------------------------------------------------------
       ON CLOSE
       ---------------------------------------------------------- */
    ws.onclose = () => {
      if (isStaleSocket(socketId)) return;

      console.log("[UI] Disconnected from bridge.");

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

  /* ----------------------------------------------------------
     SEND WRAPPER
     ---------------------------------------------------------- */
  send(obj) {
    const ws = AppState.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  },

  /* ----------------------------------------------------------
     RECONNECT SCHEDULER
     ---------------------------------------------------------- */
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

      console.log(`[UI] Reconnect attempt ${AppState.reconnectAttempts}…`);
      WebSocketManager.connect();
    }, delay);
  },

  /* ----------------------------------------------------------
     FORCE CLOSE (used by ForcedTeardownEngine)
     ---------------------------------------------------------- */
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
    incrementSocketId(); // invalidate any pending events
  }
};
/* ==========================================================
   MODULE 4 — TEAMTALK MANAGER
   ========================================================== */

/**
 * TeamTalkManager handles:
 * - initiating the TT handshake
 * - receiving TT status updates
 * - updating UI state
 * - routing TT chat
 * - rendering channels and users
 * - forced teardown integration
 */
const TeamTalkManager = {
  /* ----------------------------------------------------------
     START HANDSHAKE
     ---------------------------------------------------------- */
  startHandshake() {
    console.log("[UI] Starting TeamTalk handshake…");
    speakStatus("Connecting to TeamTalk");

    // Use your existing TT connection parameters
    TeamTalkManager.requestHandshake({
      host: "tt.seedy.cc",
      port: 10333,
      username: "admin",
      password: "admin",
      channel: "/"
    });
  },

  /* ----------------------------------------------------------
     SEND HANDSHAKE REQUEST
     ---------------------------------------------------------- */
  requestHandshake(options) {
    console.log("[UI] Requesting TeamTalk connection…");

    AppState.currentChannelPath = options.channel || "/";
    UIController.updateCurrentChannelDisplay?.();

    // Delay slightly to avoid race conditions
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

  /* ----------------------------------------------------------
     HANDLE TT STATUS
     ---------------------------------------------------------- */
  handleStatus(data) {
    const phase = data.phase || data.message;
    console.log("[TT]", phase);

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

  /* ----------------------------------------------------------
     HANDLE CHANNEL LIST
     ---------------------------------------------------------- */
  handleChannelList(data) {
    const channels = data.channels || [];
    UIController.renderChannelList(channels);
  },

  /* ----------------------------------------------------------
     HANDLE USER LIST
     ---------------------------------------------------------- */
  handleUserList(data) {
    const users = data.users || [];
    UIController.renderUserList(users);
  },

  /* ----------------------------------------------------------
     HANDLE TT CHAT
     ---------------------------------------------------------- */
  handleChat(data) {
    const from = data.from || "unknown";
    const text = data.text || "";
    UIController.appendChatLine(from, text, "[tt]");
  },

  /* ----------------------------------------------------------
     HANDLE CURRENT CHANNEL
     ---------------------------------------------------------- */
  handleCurrentChannel(data) {
    AppState.currentChannelPath = data.channel || "/";
    UIController.updateCurrentChannelDisplay?.();

    // Optional: clear activity indicators
    if (typeof clearChannelActivity === "function") {
      clearChannelActivity(AppState.currentChannelPath);
    }
  },

  /* ----------------------------------------------------------
     FORCE TEARDOWN (called by ForcedTeardownEngine)
     ---------------------------------------------------------- */
  forceDisconnect() {
    AppState.ttConnected = false;
    UIController.updateTeamTalkStatus(false);

    // Clear handshake timer
    if (AppState.ttHandshakeTimer) {
      clearTimeout(AppState.ttHandshakeTimer);
      AppState.ttHandshakeTimer = null;
    }
  }
};

/* ----------------------------------------------------------
   PUBLIC API (kept for compatibility with your HTML)
   ---------------------------------------------------------- */

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
/* ==========================================================
   MODULE 5 — MESSAGE ROUTER
   ========================================================== */

/**
 * MessageRouter receives all parsed WebSocket messages
 * and dispatches them to the correct subsystem.
 *
 * This keeps WebSocketManager clean and makes the system
 * easier to maintain and extend.
 */
const MessageRouter = {
  route(msg) {
    switch (msg.type) {
      /* ------------------------------------------------------
         BRIDGE STATUS
         ------------------------------------------------------ */
      case "status":
        if (msg.message === "connected") {
          UIController.enterConnectedState();
        }
        break;

      case "handshake-ack":
        console.log("[UI] Handshake ACK:", msg.message);
        break;

      case "pong":
        console.log("[UI] Pong received. Server time:", msg.serverTime);
        break;

      /* ------------------------------------------------------
         TEAMTALK STATUS + EVENTS
         ------------------------------------------------------ */
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

      /* ------------------------------------------------------
         WEB CHAT
         ------------------------------------------------------ */
      case "chat":
        UIController.appendChatLine(msg.from || "bridge", msg.text || "", "[web]");
        break;

      /* ------------------------------------------------------
         UNHANDLED
         ------------------------------------------------------ */
      default:
        console.log("[UI] Unhandled message type:", msg.type);
        break;
    }
  }
};
/* ==========================================================
   MODULE 6 — FORCED TEARDOWN ENGINE
   ========================================================== */

/**
 * ForcedTeardownEngine is the authoritative shutdown path.
 *
 * It:
 * - kills the WebSocket immediately
 * - invalidates stale sockets
 * - prevents reconnect attempts
 * - clears TT handshake timers
 * - forces TT disconnected
 * - forces UI disconnected
 * - guarantees no ghost sessions remain
 *
 * This module is the antidote to the TT beta’s inconsistent
 * disconnect semantics.
 */
const ForcedTeardownEngine = {
  run() {
    console.log("[UI] Forcing full teardown…");

    /* ------------------------------------------------------
       1. Stop reconnect logic
       ------------------------------------------------------ */
    AppState.manualDisconnect = true;
    AppState.reconnectAttempts = 0;

    /* ------------------------------------------------------
       2. Kill the WebSocket immediately
       ------------------------------------------------------ */
    WebSocketManager.forceClose();

    /* ------------------------------------------------------
       3. Invalidate any pending socket events
       ------------------------------------------------------ */
    incrementSocketId();

    /* ------------------------------------------------------
       4. Kill TeamTalk state + timers
       ------------------------------------------------------ */
    TeamTalkManager.forceDisconnect();

    /* ------------------------------------------------------
       5. Force UI into disconnected state
       ------------------------------------------------------ */
    UIController.enterDisconnectedState();
  }
};
/* ==========================================================
   MODULE 7 — PUBLIC API + BUTTON BINDINGS
   ========================================================== */

/**
 * This module exposes the functions your HTML already calls:
 * - connectEverything()
 * - disconnectEverything()
 * - sendChatMessage()
 *
 * Internally, these now route through the modern architecture.
 */

window.connectEverything = function () {
  console.log("[UI] Connect pressed…");

  // Reset manual disconnect intent
  AppState.manualDisconnect = false;

  // Update UI immediately
  UIController.setConnectButtonState("connecting", "Connecting…");
  speakStatus("Connecting to bridge");

  // If socket is closed or missing, create a new one
  if (!AppState.socket || AppState.socket.readyState === WebSocket.CLOSED) {
    WebSocketManager.connect();
    return;
  }

  // If already connected, just ensure TT handshake
  if (AppState.bridgeConnected && AppState.ttConnected) {
    speakStatus("Already connected");
    return;
  }

  // If socket is open but TT not connected, start handshake
  if (AppState.socket.readyState === WebSocket.OPEN) {
    UIController.enterConnectedState();
    TeamTalkManager.startHandshake();
  } else {
    speakStatus("Connecting to bridge");
  }
};

window.disconnectEverything = function () {
  console.log("[UI] Disconnect pressed…");

  // Best-effort notify the server
  try {
    WebSocketManager.send({ type: "disconnect" });
  } catch (_) {}

  // Perform full forced teardown
  ForcedTeardownEngine.run();
};

/* ----------------------------------------------------------
   CHAT API
   ---------------------------------------------------------- */

window.sendChatMessage = function (from, text) {
  WebSocketManager.send({
    type: "chat",
    from,
    text
  });
};
