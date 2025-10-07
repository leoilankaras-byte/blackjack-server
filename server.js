// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static frontend files from "public" folder
app.use(express.static('public'));

// Helper functions for deck and blackjack logic
function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function calculateScore(cards) {
  let score = 0;
  let aces = 0;
  for (const card of cards) {
    if (['J','Q','K'].includes(card.rank)) score += 10;
    else if (card.rank === 'A') {
      aces++;
      score += 11;
    } else {
      score += parseInt(card.rank);
    }
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

// Lobbies data: lobbyCode -> lobby object
const lobbies = {};

function generateLobbyCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i=0; i<6; i++) {
    code += chars.charAt(Math.floor(Math.random()*chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createLobby', () => {
    let code;
    do {
      code = generateLobbyCode();
    } while (lobbies[code]);
    lobbies[code] = {
      players: [],
      host: socket.id,
      deck: [],
      currentPlayerIndex: 0,
      gameStarted: false,
    };
    socket.join(code);
    lobbies[code].players.push({
      id: socket.id,
      cards: [],
      score: 0,
      stood: false,
      busted: false,
    });
    socket.emit('lobbyCreated', code);
    io.to(code).emit('updatePlayers', lobbies[code].players.map(p => p.id));
  });

  socket.on('joinLobby', (code) => {
    code = code.toUpperCase();
    const lobby = lobbies[code];
    if (!lobby) {
      socket.emit('lobbyError', 'Lobby not found.');
      return;
    }
    if (lobby.players.length >= 8) {
      socket.emit('lobbyError', 'Lobby full.');
      return;
    }
    if (lobby.gameStarted) {
      socket.emit('lobbyError', 'Game already started.');
      return;
    }
    socket.join(code);
    lobby.players.push({
      id: socket.id,
      cards: [],
      score: 0,
      stood: false,
      busted: false,
    });
    socket.emit('lobbyJoined', code, lobby.players.map(p => p.id));
    io.to(code).emit('updatePlayers', lobby.players.map(p => p.id));
  });

  socket.on('startGame', (code) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.host !== socket.id) return;

    lobby.gameStarted = true;
    lobby.deck = createDeck();
    shuffle(lobby.deck);

    // Deal 2 cards to each player
    lobby.players.forEach(player => {
      player.cards = [lobby.deck.pop(), lobby.deck.pop()];
      player.score = calculateScore(player.cards);
      player.stood = false;
      player.busted = false;
    });
    lobby.currentPlayerIndex = 0;

    io.to(code).emit('gameStarted', {
      players: lobby.players.map(p => ({
        id: p.id,
        cards: p.cards,
        score: p.score,
        stood: p.stood,
        busted: p.busted,
      })),
      currentPlayer: lobby.players[lobby.currentPlayerIndex].id,
      revealFirstCard: false,
    });
  });

  socket.on('hit', (code) => {
    const lobby = lobbies[code];
    if (!lobby) return;
    if (!lobby.gameStarted) return;

    const player = lobby.players[lobby.currentPlayerIndex];
    if (player.id !== socket.id) return; // Not this player's turn
    if (player.stood || player.busted) return;

    player.cards.push(lobby.deck.pop());
    player.score = calculateScore(player.cards);
    if (player.score > 21) {
      player.busted = true;
    }

    io.to(code).emit('gameStateUpdate', {
      players: lobby.players.map(p => ({
        id: p.id,
        cards: p.cards,
        score: p.score,
        stood: p.stood,
        busted: p.busted,
      })),
      currentPlayer: player.id,
      revealFirstCard: false,
    });

    if (player.busted) {
      // Move turn to next player
      nextTurn(lobby);
    }
  });

  socket.on('stand', (code) => {
    const lobby = lobbies[code];
    if (!lobby) return;
    if (!lobby.gameStarted) return;

    const player = lobby.players[lobby.currentPlayerIndex];
    if (player.id !== socket.id) return; // Not this player's turn
    player.stood = true;

    io.to(code).emit('gameStateUpdate', {
      players: lobby.players.map(p => ({
        id: p.id,
        cards: p.cards,
        score: p.score,
        stood: p.stood,
        busted: p.busted,
      })),
      currentPlayer: player.id,
      revealFirstCard: false,
    });

    nextTurn(lobby);
  });

  function nextTurn(lobby) {
    // Move to next player who is not busted or stood
    let idx = lobby.currentPlayerIndex;
    do {
      idx = (idx + 1) % lobby.players.length;
      const p = lobby.players[idx];
      if (!p.stood && !p.busted) {
        lobby.currentPlayerIndex = idx;
        io.to(lobby.host).emit('hostTurn', p.id);
        io.to(lobby.players[idx].id).emit('yourTurn');
        io.to(lobby.players[idx].id).emit('playerTurn', p.id);
        io.to(lobby.code).emit('playerTurn', p.id);
        io.to(lobby.code).emit('gameStateUpdate', {
          players: lobby.players.map(pl => ({
            id: pl.id,
            cards: pl.cards,
            score: pl.score,
            stood: pl.stood,
            busted: pl.busted,
          })),
          currentPlayer: p.id,
          revealFirstCard: false,
        });
        return;
      }
    } while (idx !== lobby.currentPlayerIndex);

    // All players either stood or busted — game over
    endGame(lobby);
  }

  function endGame(lobby) {
    lobby.gameStarted = false;

    // Calculate winners
    const results = lobby.players.map(p => {
      if (p.busted) return { id: p.id, result: 'Busted' };
      return { id: p.id, result: `Score: ${p.score}` };
    });

    io.to(lobby.code).emit('gameOver', results);
  }

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // Remove from any lobby they were in
    for (const code in lobbies) {
      const lobby = lobbies[code];
      const idx = lobby.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        lobby.players.splice(idx, 1);
        io.to(code).emit('updatePlayers', lobby.players.map(p => p.id));

        // If lobby empty, delete it
        if (lobby.players.length === 0) {
          delete lobbies[code];
        } else if (lobby.host === socket.id) {
          // Host left, assign new host
          lobby.host = lobby.players[0].id;
          io.to(code).emit('lobbyHostChanged', lobby.host);
        }
        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
