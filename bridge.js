class BridgeAdapter {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.connected = false;
    this.manualDisconnect = false;

    // Cached TeamTalk state
    this.channels = [];
    this.users = [];
    this.currentChannel = { name: "/", path: "/" };
    this.asyncMessages = [];

    // Credentials from HTML config
    this.username = window._ttUsername || "WebClient";
    this.password = window._ttPassword || "";

    // Presence tones
    this.joinTone = document.getElementById("sound-presence-join");
    this.leaveTone = document.getElementById("sound-presence-leave");
    this.channelTone = document.getElementById("sound-channel-change");

    // TeamTalk tones
    this.ttConnectTone = document.getElementById("sound-tt-connected");
    this.ttDisconnectTone = document.getElementById("sound-tt-disconnected");

    // Keepalive + reconnect
    this.keepalive = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    // Status panel elements
    this.bridgeStatus = document.getElementById("bridge-status");
    this.ttStatus = document.getElementById("tt-status");

    updateReadyStatus(false);
  }

  /* -------------------------------------------------------
     Event system
     ------------------------------------------------------- */
  on(event, callback) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(callback);
  }

  emit(event, data) {
    if (this.handlers[event]) {
      for (const cb of this.handlers[event]) cb(data);
    }
  }

  /* -------------------------------------------------------
     Utility: vibration cue
     ------------------------------------------------------- */
  vibrate(pattern) {
    if (window._vibrationEnabled && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  /* -------------------------------------------------------
     Accessible error banner
     ------------------------------------------------------- */
  showError(msg) {
    let banner = document.getElementById("error-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "error-banner";
      banner.setAttribute("role", "alert");
      banner.style.background = "#b00020";
      banner.style.color = "white";
      banner.style.padding = "10px";
      banner.style.margin = "10px";
      banner.style.borderRadius = "6px";
      banner.style.fontSize = "1rem";
      banner.style.fontWeight = "bold";
      banner.style.maxWidth = "90%";
      banner.style.marginLeft = "auto";
      banner.style.marginRight = "auto";
      banner.style.textAlign = "center";
      document.body.prepend(banner);
    }

    banner.textContent = msg;
    banner.style.display = "block";

    setTimeout(() => {
      banner.style.display = "none";
    }, 5000);
  }

  /* -------------------------------------------------------
     WebSocket connection + auto‑reconnect
     ------------------------------------------------------- */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.manualDisconnect = false;
        this.bridgeStatus.textContent = "Bridge: 🟡 Connecting…";
        updateReadyStatus(false);

        this.ws = new WebSocket("ws://localhost:8080");

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.bridgeStatus.textContent = "Bridge: 🟢 Connected";
          this.emit("connected");

          // Initial handshake
          this.ws.send(JSON.stringify({ type: "handshake" }));

          // Identity announcement
          this.ws.send(JSON.stringify({
            type: "tt-identify",
            username: this.username
          }));

          // TeamTalk login request
          this.ws.send(JSON.stringify({
            type: "tt-connect",
            host: window._ttHost || "localhost",
            port: window._ttPort || 10333,
            username: this.username,
            password: this.password,
            nickname: this.username
          }));

          this.startKeepalive();
          resolve();
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.bridgeStatus.textContent = "Bridge: 🔴 Disconnected";
          this.emit("disconnected");
          this.stopKeepalive();
          updateReadyStatus(false);

          if (!this.manualDisconnect) {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++;
              this.bridgeStatus.textContent = "Bridge: 🟡 Reconnecting…";
              this.showError("Connection lost. Reconnecting…");
              setTimeout(() => this.connect(), 3000);
            } else {
              this.bridgeStatus.textContent =
                "Bridge: 🔴 Couldn’t reconnect. Tap Connect to try again.";
              this.showError("Couldn’t reconnect. Tap Connect to try again.");
            }
          }
        };

        this.ws.onerror = (err) => {
          console.error("WebSocket error:", err);
          this.showError("Bridge error: " + err.message);
          reject(err);
        };

        this.ws.onmessage = (msg) => {
          let data;
          try {
            data = JSON.parse(msg.data);
          } catch (e) {
            console.error("Failed to parse message:", e);
            return;
          }
          this.handleMessage(data);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /* -------------------------------------------------------
     Keepalive pings
     ------------------------------------------------------- */
  startKeepalive() {
    this.stopKeepalive();
    this.keepalive = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      }
    }, 25000);
  }

  stopKeepalive() {
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
  }

  /* -------------------------------------------------------
     Message handler (server → UI)
     ------------------------------------------------------- */
  handleMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case "presence-join":
        if (this.joinTone) this.joinTone.play();
        this.vibrate([40, 40, 40]);
        logPresence(`${data.user || "Someone"} joined`);
        this.emit("presence-join", data);
        break;

      case "presence-leave":
        if (this.leaveTone) this.leaveTone.play();
        this.vibrate([60]);
        logPresence(`${data.user || "Someone"} left`);
        this.emit("presence-leave", data);
        break;

      case "channel-change":
        if (this.channelTone) this.channelTone.play();
        this.vibrate([30, 30, 30, 30]);
        logPresence(`Channel changed to ${data.channel}`);
        this.emit("channel-change", data);
        break;

      case "tt-status":
        this.handleTTStatus(data);
        break;

      case "tt-channel-list":
      case "tt-channel-list-full":
        this.channels = data.channels || [];
        this.emit("channel-added");
        break;

      case "tt-user-list":
      case "tt-user-list-full":
        this.users = data.users || [];
        this.emit("user-connected");
        break;

      case "tt-current-channel":
        this.currentChannel = {
          name: data.channel || "/",
          path: data.channel || "/"
        };
        this.emit("channel-changed");
        break;

      case "cw-async":
        if (!this.asyncMessages) this.asyncMessages = [];
        this.asyncMessages.push(data);
        this.emit("async-message", data);
        break;

      case "tt-chat":
        this.emit("chat-message", {
          type: "live_text",
          text: data.text || "",
          user: data.user || data.nickname || "Someone",
          timestamp: data.timestamp || Date.now()
        });
        break;

      default:
        this.emit("message", data);
        break;
    }
  }

  handleTTStatus(data) {
    switch (data.phase) {
      case "received":
      case "login-sent":
      case "server-message":
      case "connecting":
      case "authenticating":
        break;

      case "connected":
        this.ttStatus.textContent = "TeamTalk: 🟢 Connected";
        if (this.ttConnectTone) this.ttConnectTone.play();
        this.vibrate([80, 40, 80]);
        updateReadyStatus(true);
        this.emit("tt-connected");
        break;

      case "failed":
        this.ttStatus.textContent = "TeamTalk: 🔴 Failed";
        this.showError("TeamTalk connection failed.");
        updateReadyStatus(false);
        break;

      case "disconnected":
        this.ttStatus.textContent = "TeamTalk: 🔴 Disconnected";
        if (this.ttDisconnectTone) this.ttDisconnectTone.play();
        this.vibrate([120]);
        updateReadyStatus(false);
        break;
    }
  }

  /* -------------------------------------------------------
     TeamTalk + async primitives
     ------------------------------------------------------- */
  async getChannels() {
    return this.channels;
  }

  async getUsers() {
    return this.users;
  }

  async getCurrentChannel() {
    return this.currentChannel;
  }

  async getAsyncMessages() {
    return this.asyncMessages;
  }

  joinChannel(id) {
    const ch = this.channels.find(c => c.id === id);
    const path = ch ? ch.path : "/";

    this.ws.send(JSON.stringify({
      type: "tt-join",
      channel: path
    }));
  }

  sendChat(text) {
    this.ws.send(JSON.stringify({
      type: "tt-chat",
      text
    }));
  }

  sendAsync(text) {
    this.ws.send(JSON.stringify({
      type: "cw-async",
      text,
      timestamp: Date.now()
    }));
  }

  // Explicit override: caller chooses async vs live
  sendMessage(text, mode = "live") {
    if (mode === "async") {
      this.sendAsync(text);
    } else {
      this.sendChat(text);
    }
  }

  /* -------------------------------------------------------
     Automation: system decides async vs live
     ------------------------------------------------------- */
  isLiveContext() {
    const ttConnected =
      this.ttStatus && this.ttStatus.textContent.includes("🟢");
    const othersPresent = (this.users || []).length > 0;
    return ttConnected && othersPresent;
  }

  autoSend(text) {
    const mode = this.isLiveContext() ? "live" : "async";
    this.sendMessage(text, mode);
    return mode;
  }

  /* -------------------------------------------------------
     AAC: symbols + dwell (AAC‑side only)
     ------------------------------------------------------- */
  sendSymbolTap(symbolId, label, source = "tap") {
    const event = {
      type: "symbol_tap",
      symbolId,
      label,
      source,
      timestamp: Date.now()
    };
    this.emit("symbol-tap", event);

    const text = label || symbolId;
    const mode = this.autoSend(text);
    this.emit("symbol-tap-sent", { ...event, mode });
  }

  sendDwellSymbol(symbolId, label) {
    this.sendSymbolTap(symbolId, label, "dwell");
  }

  /* -------------------------------------------------------
     Live audio → TeamTalk
     ------------------------------------------------------- */
  startLiveAudioSession() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "cw-live-audio-start" }));
  }

  stopLiveAudioSession() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "cw-live-audio-stop" }));
  }

  sendLiveAudioChunk(base64Data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: "cw-live-audio-chunk",
      data: base64Data
    }));
  }

  /* -------------------------------------------------------
     AAC UI wrappers
     ------------------------------------------------------- */
  async connectEverything() {
    await this.connect();
  }

  disconnectEverything() {
    this.manualDisconnect = true;
    this.stopKeepalive();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.bridgeStatus.textContent = "Bridge: 🔴 Disconnected";
    this.ttStatus.textContent = "TeamTalk: 🔴 Disconnected";
    updateReadyStatus(false);
  }
}

const bridge = new BridgeAdapter();
