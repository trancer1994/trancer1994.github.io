/* ---------------------------------------------------------
   Connecting Worlds – AAC‑Friendly Bridge Adapter
   Restores the old RPC-style API expected by joinin.html,
   while using the new WebSocket event-driven backend.
   --------------------------------------------------------- */

class BridgeAdapter {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.connected = false;

    // Cached TeamTalk state (populated from server messages)
    this.channels = [];          // array of { id, name, path }
    this.users = [];             // array of { id, nickname, channelId }
    this.currentChannel = {      // { name, path }
      name: "/",
      path: "/"
    };

    // Presence tones
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
     WebSocket connection
     ------------------------------------------------------- */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket("wss://connectingworlds-bridge.onrender.com");

        this.ws.onopen = () => {
          this.connected = true;
          this.emit("connected");

          // Perform handshake immediately
          this.ws.send(JSON.stringify({ type: "handshake" }));

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
     Message handler (server → UI)
     ------------------------------------------------------- */
  handleMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {

      /* Presence tones */
      case "presence-join":
        if (this.joinTone) this.joinTone.play();
        this.emit("presence-join", data);
        break;

      case "presence-leave":
        if (this.leaveTone) this.leaveTone.play();
        this.emit("presence-leave", data);
        break;

      case "channel-change":
        if (this.channelTone) this.channelTone.play();
        this.emit("channel-change", data);
        break;

      /* TeamTalk state updates */
      case "tt-channel-list":
        this.channels = data.channels || [];
        this.emit("channel-added");
        break;

      case "tt-user-list":
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

      default:
        this.emit("message", data);
        break;
    }
  }

  /* -------------------------------------------------------
     RPC-style API expected by joinin.html
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

  /* Convert channel ID → path internally */
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

  /* -------------------------------------------------------
     AAC UI expects these global wrappers
     ------------------------------------------------------- */

  async connectEverything() {
    await this.connect();
  }

  disconnectEverything() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/* ---------------------------------------------------------
   Export instance
   --------------------------------------------------------- */
const bridge = new BridgeAdapter();
