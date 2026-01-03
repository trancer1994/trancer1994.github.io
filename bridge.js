const socket = new WebSocket("wss://connectingworlds-bridge.onrender.com");

socket.onopen = () => {
  console.log("Connected to Connecting Worlds bridge");

  socket.send(JSON.stringify({
    type: "handshake",
    client: "web-ui",
    protocol: 1,
    capabilities: ["chat", "status"],
    timestamp: Date.now()
  }));
};
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Received:", data);
};

socket.onerror = (err) => {
  console.error("WebSocket error:", err);
};

socket.onclose = () => {
  console.log("Disconnected from bridge");
};

window.sendMessage = function(text, from = "web") {
  socket.send(JSON.stringify({
    type: "chat",
    from,
    text
  }));
};
