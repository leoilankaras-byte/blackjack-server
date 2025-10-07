const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve files in /public (frontend)
app.use(express.static(path.join(__dirname, "public")));

// Store lobbies with game state
const lobbies = {};

// Create a 6-deck shoe (312 cards)
function createDeck() {
  const suits = ["hearts", "diamonds", "clubs", "spades"];
  const ranks = [
    "A", "2", "3", "4", "5", "6", "7",
    "8", "9", "10", "J", "Q", "K"
  ];
  const deck = [];
  for (let i = 0; i < 6; i++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }
  }
  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Calculate hand value
function getHandValue(hand) {
  let value = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === "A") {
      value += 11;
      aces++;
    } else if (["K", "Q", "J"].includes(card.rank)) {
      value += 10;
    } else {
      value += parseInt(card.rank);
    }
  }

  // Adjust for aces
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

// Create random 6-character lobby code
function generateLobbyCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);

  socket.on("createLobby", () => {
    const code = generateLobbyCode();
    lobbies[code] = {
      players: {},
      deck: createDeck(),
      currentTurn: null,
      started: false
    };
    socket.join(code);
    lobbies[code].players[socket.id] = {
      hand: [],
      stand: false,
      busted: false
    };
    socket.emit("lobbyCreated", code);
    console.log(`📦 Lobby ${code} created`);
  });

  socket.on("joinLobby", (code) => {
    const lobby = lobbies[code];
    if (!lobby) return socket.emit("errorMessage", "Lobby not found.");
    if (Object.keys(lobby.players).length >= 8)
      return socket.emit("errorMessage", "Lobby is full.");

    socket.join(code);
    lobby.players[socket.id] = {
      hand: [],
      stand: false,
      busted: false
    };

    io.to(code).emit("playerJoined", {
      players: Object.keys(lobby.players),
    });

    if (Object.keys(lobby.players).length >= 2 && !lobby.started) {
      startGame(code);
    }
  });

  socket.on("hit", (code) => {
    const lobby = lobbies[code];
    if (!lobby || !lobby.players[socket.id]) return;

    if (lobby.currentTurn !== socket.id) return;

    const card = lobby.deck.pop();
    lobby.players[socket.id].hand.push(card);

    const handValue = getHandValue(lobby.players[socket.id].hand);
    if (handValue > 21) {
      lobby.players[socket.id].busted = true;
      lobby.players[socket.id].stand = true;
    }

    io.to(code).emit("playerUpdate", {
      id: socket.id,
      hand: lobby.players[socket.id].hand,
      value: handValue,
      busted: lobby.players[socket.id].busted
    });

    nextTurn(code);
  });

  socket.on("stand", (code) => {
    const lobby = lobbies[code];
    if (!lobby || !lobby.players[socket.id]) return;

    if (lobby.currentTurn !== socket.id) return;

    lobby.players[socket.id].stand = true;

    io.to(code).emit("playerUpdate", {
      id: socket.id,
      hand: lobby.players[socket.id].hand,
      value: getHandValue(lobby.players[socket.id].hand),
      busted: lobby.players[socket.id].busted
    });

    nextTurn(code);
  });

  socket.on("disconnect", () => {
    for (const code in lobbies) {
      const lobby = lobbies[code];
      if (lobby.players[socket.id]) {
        delete lobby.players[socket.id];
        io.to(code).emit("playerLeft", socket.id);
      }

      // Remove lobby if empty
      if (Object.keys(lobby.players).length === 0) {
        delete lobbies[code];
      }
    }
    console.log(`❌ Player disconnected: ${socket.id}`);
  });
});

function startGame(code) {
  const lobby = lobbies[code];
  if (!lobby) return;

  lobby.started = true;
  const playerIDs = Object.keys(lobby.players);

  // Deal 2 cards to each player
  for (const id of playerIDs) {
    const player = lobby.players[id];
    player.hand.push(lobby.deck.pop());
    player.hand.push(lobby.deck.pop());
  }

  // Set the first player's turn
  lobby.currentTurn = playerIDs[0];

  io.to(code).emit("gameStarted", {
    players: playerIDs,
    hands: getVisibleHands(code),
    turn: lobby.currentTurn
  });
}

function getVisibleHands(code) {
  const lobby = lobbies[code];
  const result = {};

  for (const id in lobby.players) {
    result[id] = {
      hand: lobby.players[id].hand,
      value: getHandValue(lobby.players[id].hand),
      busted: lobby.players[id].busted
    };
  }

  return result;
}

function nextTurn(code) {
  const lobby = lobbies[code];
  const playerIDs = Object.keys(lobby.players);
  const index = playerIDs.indexOf(lobby.currentTurn);

  // Find the next player who hasn't stood
  for (let i = 1; i <= playerIDs.length; i++) {
    const nextIndex = (index + i) % playerIDs.length;
    const nextPlayer = lobby.players[playerIDs[nextIndex]];

    if (!nextPlayer.stand && !nextPlayer.busted) {
      lobby.currentTurn = playerIDs[nextIndex];
      io.to(code).emit("turnChanged", lobby.currentTurn);
      return;
    }
  }

  // If no players can move, end game
  io.to(code).emit("gameOver", getVisibleHands(code));
}

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

