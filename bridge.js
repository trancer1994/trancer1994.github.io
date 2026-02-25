/* ---------------------------------------------------------
   Connecting Worlds – Bridge Adapter
   AAC‑friendly version with:
   • Distinct tones (join / leave / channel change)
   • Visual cues (soft flashes)
   • Presence log in chat
   • No spoken system chatter
   --------------------------------------------------------- */

class BridgeAdapter {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.connected = false;

    /* Presence tones */
    this.joinTone = document.getElementById("sound-presence-join");
    this.leaveTone = document.getElementById("sound-presence-leave");
    this.channelTone = document.getElementById("sound-channel-change");
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
     Connection management
     ------------------------------------------------------- */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket("ws://localhost:8090");

        this.ws.onopen = () => {
          this.connected = true;
          this.emit("connected");
          resolve();
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.emit("disconnected");
        };

        this.ws.onerror = (err) => {
          console.error("WebSocket error:", err);
          reject(err);
        };

        this.ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            this.handleMessage(data);
          } catch (e) {
            console.error("Bad message from bridge:", msg.data);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /* -------------------------------------------------------
     Outgoing messages
     ------------------------------------------------------- */
  send(type, payload = {}) {
    if (!this.connected || !this.ws) return;
    this.ws.send(JSON.stringify({ type, ...payload }));
  }

  joinChannel(id) {
    this.send("join-channel", { id });

    /* User‑initiated channel change → orientation tone */
    if (this.channelTone) {
      this.channelTone.currentTime = 0;
      this.channelTone.play().catch(() => {});
    }

    /* Visual cue flag */
    window._flashChannelChange = true;
  }

  sendChat(text) {
    this.send("send-chat", { text });
  }

  /* -------------------------------------------------------
     Incoming messages
     ------------------------------------------------------- */
  handleMessage(msg) {
    switch (msg.type) {

      case "channels":
        this.emit("channels", msg.channels);
        break;

      case "users":
        this.emit("users", msg.users);
        break;

      case "current-channel":
        this.emit("current-channel", msg.channel);
        break;

      case "channel-added":
        this.emit("channel-added", msg.channel);
        break;

      case "channel-removed":
        this.emit("channel-removed", msg.id);
        break;

      case "user-connected":
        /* Presence tone */
        if (this.joinTone) {
          this.joinTone.currentTime = 0;
          this.joinTone.play().catch(() => {});
        }

        /* Visual cue */
        window._flashUserJoin = msg.user.id;

        /* Presence log */
        logPresence(`${msg.user.nickname} joined`);

        this.emit("user-connected", msg.user);
        break;

      case "user-disconnected":
        /* Presence tone */
        if (this.leaveTone) {
          this.leaveTone.currentTime = 0;
          this.leaveTone.play().catch(() => {});
        }

        /* Visual cue */
        window._flashUserLeave = msg.id;

        /* Presence log */
        logPresence(`A user left`);

        this.emit("user-disconnected", msg.id);
        break;

      case "channel-changed":
        /* Orientation tone */
        if (this.channelTone) {
          this.channelTone.currentTime = 0;
          this.channelTone.play().catch(() => {});
        }

        /* Visual cue */
        window._flashChannelChange = true;

        /* Presence log */
        logPresence(`Channel changed`);

        this.emit("channel-changed", msg.channel);
        break;

      case "chat":
        this.emit("chat", msg);
        break;

      default:
        console.warn("Unknown message from bridge:", msg);
    }
  }

  /* -------------------------------------------------------
     Convenience wrappers for UI
     ------------------------------------------------------- */
  async getChannels() {
    return new Promise((resolve) => {
      const handler = (chs) => {
        this.handlers["channels"] =
          this.handlers["channels"].filter((h) => h !== handler);
        resolve(chs);
      };
      this.on("channels", handler);
      this.send("get-channels");
    });
  }

  async getUsers() {
    return new Promise((resolve) => {
      const handler = (users) => {
        this.handlers["users"] =
          this.handlers["users"].filter((h) => h !== handler);
        resolve(users);
      };
      this.on("users", handler);
      this.send("get-users");
    });
  }

  async getCurrentChannel() {
    return new Promise((resolve) => {
      const handler = (ch) => {
        this.handlers["current-channel"] =
          this.handlers["current-channel"].filter((h) => h !== handler);
        resolve(ch);
      };
      this.on("current-channel", handler);
      this.send("get-current-channel");
    });
  }
}

/* ---------------------------------------------------------
   Global instance
   --------------------------------------------------------- */
const bridge = new BridgeAdapter();

/* ---------------------------------------------------------
   UI helpers for Connect / Disconnect
   --------------------------------------------------------- */

async function connectEverything() {
  try {
    speakText("Connecting");

    await bridge.connect();

    document.getElementById("connect-btn").style.display = "none";
    document.getElementById("disconnect-btn").style.display = "block";

    document.getElementById("bridge-status").textContent =
      "Bridge: 🟢 Connected";
    document.getElementById("tt-status").textContent =
      "TeamTalk: 🟢 Connected";

  } catch (err) {
    console.error("Failed to connect:", err);
  }
}

function disconnectEverything() {
  speakText("Disconnecting");

  bridge.disconnect();

  document.getElementById("connect-btn").style.display = "block";
  document.getElementById("disconnect-btn").style.display = "none";

  document.getElementById("bridge-status").textContent =
    "Bridge: 🔴 Disconnected";
  document.getElementById("tt-status").textContent =
    "TeamTalk: 🔴 Disconnected";
}

/* ---------------------------------------------------------
   Chat wrapper
   --------------------------------------------------------- */
function sendTeamTalkChat() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;

  bridge.sendChat(text);
  input.value = "";
}

/* ---------------------------------------------------------
   Presence log helper
   --------------------------------------------------------- */
function logPresence(text) {
  const chat = document.getElementById("chat");
  const p = document.createElement("p");
  p.style.color = "#666";
  p.style.fontSize = "0.85rem";
  p.textContent = text;
  chat.appendChild(p);
  chat.scrollTop = chat.scrollHeight;
}
