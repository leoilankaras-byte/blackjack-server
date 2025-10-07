const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // serve index.html and game.js

// Simple lobby data structure (adjust as needed)
const lobbies = {};  // lobbyCode => { players: [], hostId: '' }

function generateLobbyCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on("createLobby", () => {
    const code = generateLobbyCode();
    lobbies[code] = {
      players: [socket.id],
      hostId: socket.id,
    };
    socket.join(code);
    socket.emit("lobbyCreated", code);
    io.to(code).emit("updatePlayers", lobbies[code].players);
  });

  socket.on("joinLobby", (code) => {
    if (lobbies[code] && lobbies[code].players.length < 8) {
      lobbies[code].players.push(socket.id);
      socket.join(code);
      socket.emit("lobbyJoined", code, lobbies[code].players);
      io.to(code).emit("updatePlayers", lobbies[code].players);
    } else {
      socket.emit("lobbyError", "Lobby not found or full");
    }
  });

  socket.on("startGame", (code) => {
    if (lobbies[code] && lobbies[code].hostId === socket.id) {
      io.to(code).emit("gameStarted", { lobbyCode: code, players: lobbies[code].players });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    // Clean up player from lobbies here (left as exercise)
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
