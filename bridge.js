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
this.ws = new WebSocket("wss://connectingworlds-bridge.onrender.com");


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
