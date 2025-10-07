const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const lobbies = {};

function generateLobbyCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createLobby', () => {
    const code = generateLobbyCode();
    lobbies[code] = { players: [socket.id] };
    socket.join(code);
    socket.emit('lobbyCreated', code);
  });

  socket.on('joinLobby', (code) => {
    const lobby = lobbies[code];
    if (lobby && lobby.players.length < 2) {
      lobby.players.push(socket.id);
      socket.join(code);
      io.to(code).emit('startGame', { message: "Game started!", players: lobby.players });
    } else {
      socket.emit('errorMessage', 'Invalid lobby or full.');
    }
  });

  socket.on('disconnect', () => {
    for (let code in lobbies) {
      const lobby = lobbies[code];
      lobby.players = lobby.players.filter(p => p !== socket.id);
      if (lobby.players.length === 0) delete lobbies[code];
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log('Server running on port 3000');
});
