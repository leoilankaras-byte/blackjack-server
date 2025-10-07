const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public")); // serve your frontend files from /public

// In-memory lobbies store
const lobbies = {};

// Generate 6-character lobby code
function generateLobbyCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create a fresh shuffled deck
function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = [
    "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
  ];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  // Shuffle deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Calculate blackjack hand value
function calculateHandValue(cards) {
  let value = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === "A") {
      aces++;
      value += 11;
    } else if (["K", "Q", "J"].includes(card.rank)) {
      value += 10;
    } else {
      value += Number(card.rank);
    }
  }

  // Adjust for aces
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

// Start game: deal 2 cards per player and init game state
function startGame(lobby) {
  lobby.deck = createDeck();
  lobby.currentTurnIndex = 0;
  lobby.gameOver = false;

  for (const playerId of lobby.players) {
    lobby.hands[playerId] = [lobby.deck.pop(), lobby.deck.pop()];
    lobby.stands[playerId] = false;
  }
}

// Advance to next active player (not stood or busted), return playerId or null if none left
function advanceTurn(lobby) {
  let attempts = 0;
  do {
    lobby.currentTurnIndex =
      (lobby.currentTurnIndex + 1) % lobby.players.length;
    const currentPlayerId = lobby.players[lobby.currentTurnIndex];
    const handValue = calculateHandValue(lobby.hands[currentPlayerId]);
    if (!lobby.stands[currentPlayerId] && handValue <= 21) {
      return currentPlayerId;
    }
    attempts++;
  } while (attempts < lobby.players.length);
  return null;
}

// Determine winner(s)
function determineWinners(lobby) {
  let bestScore = 0;
  let winners = [];

  for (const playerId of lobby.players) {
    const val = calculateHandValue(lobby.hands[playerId]);
    if (val <= 21) {
      if (val > bestScore) {
        bestScore = val;
        winners = [playerId];
      } else if (val === bestScore) {
        winners.push(playerId);
      }
    }
  }
  return winners;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("createLobby", () => {
    let code;
    do {
      code = generateLobbyCode();
    } while (lobbies[code]);
    lobbies[code] = {
      players: [socket.id],
      hands: {},
      stands: {},
      deck: [],
      currentTurnIndex: 0,
      gameOver: false,
    };
    socket.join(code);
    socket.emit("lobbyCreated", code);
    io.to(code).emit("updatePlayers", lobbies[code].players);
  });

  socket.on("joinLobby", (code) => {
    code = code.toUpperCase();
    const lobby = lobbies[code];
    if (!lobby) {
      socket.emit("lobbyError", "Lobby does not exist.");
      return;
    }
    if (lobby.players.length >= 8) {
      socket.emit("lobbyError", "Lobby full.");
      return;
    }
    lobby.players.push(socket.id);
    socket.join(code);
    socket.emit("lobbyJoined", code, lobby.players);
    io.to(code).emit("updatePlayers", lobby.players);
  });

  socket.on("startGame", (code) => {
    const lobby = lobbies[code];
    if (!lobby) return;
    if (lobby.players[0] !== socket.id) {
      socket.emit("lobbyError", "Only host can start the game.");
      return;
    }
    startGame(lobby);
    // Emit game started with players and hands
    const playersData = lobby.players.map((pid) => ({
      id: pid,
      cards: lobby.hands[pid],
    }));
    io.to(code).emit("gameStarted", { players: playersData, showAllCards: false });
    // Tell first player to start turn
    const currentPlayerId = lobby.players[lobby.currentTurnIndex];
    io.to(code).emit("playerTurn", currentPlayerId);
  });

  socket.on("hit", ({ lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby || lobby.gameOver) return;

    if (lobby.players[lobby.currentTurnIndex] !== socket.id) {
      socket.emit("lobbyError", "Not your turn.");
      return;
    }

    const card = lobby.deck.pop();
    lobby.hands[socket.id].push(card);

    const handValue = calculateHandValue(lobby.hands[socket.id]);
    // If bust, automatically stand for player
    if (handValue > 21) {
      lobby.stands[socket.id] = true;
      // Advance turn to next player
      const nextPlayerId = advanceTurn(lobby);
      if (!nextPlayerId) {
        // Game over
        lobby.gameOver = true;
        const winners = determineWinners(lobby);
        const message = winners.length
          ? `Winner(s): ${winners.map((w) => w.slice(0, 5)).join(", ")}`
          : "No winners, all busted.";
        io.to(lobbyCode).emit("gameOver", { message });
        io.to(lobbyCode).emit("gameStateUpdate", {
          players: lobby.players.map((pid) => ({ id: pid, cards: lobby.hands[pid] })),
          showAllCards: true,
        });
        return;
      }
      lobby.currentTurnIndex = lobby.players.indexOf(nextPlayerId);
      io.to(lobbyCode).emit("playerTurn", nextPlayerId);
    }

    // Send updated game state to all players
    io.to(lobbyCode).emit("gameStateUpdate", {
      players: lobby.players.map((pid) => ({ id: pid, cards: lobby.hands[pid] })),
      showAllCards: false,
    });
  });

  socket.on("stand", ({ lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby || lobby.gameOver) return;

    if (lobby.players[lobby.currentTurnIndex] !== socket.id) {
      socket.emit("lobbyError", "Not your turn.");
      return;
    }

    lobby.stands[socket.id] = true;

    // Advance turn
    const nextPlayerId = advanceTurn(lobby);
    if (!nextPlayerId) {
      // Game over
      lobby.gameOver = true;
      const winners = determineWinners(lobby);
      const message = winners.length
        ? `Winner(s): ${winners.map((w) => w.slice(0, 5)).join(", ")}`
        : "No winners, all busted.";
      io.to(lobbyCode).emit("gameOver", { message });
      io.to(lobbyCode).emit("gameStateUpdate", {
        players: lobby.players.map((pid) => ({ id: pid, cards: lobby.hands[pid] })),
        showAllCards: true,
      });
      return;
    }
    lobby.currentTurnIndex = lobby.players.indexOf(nextPlayerId);
    io.to(lobbyCode).emit("playerTurn", nextPlayerId);

    // Send updated game state to all players
    io.to(lobbyCode).emit("gameStateUpdate", {
      players: lobby.players.map((pid) => ({ id: pid, cards: lobby.hands[pid] })),
      showAllCards: false,
    });
  });

  socket.on("disconnecting", () => {
    // Remove player from any lobby they were in
    for (const code of socket.rooms) {
      if (lobbies[code]) {
        const lobby = lobbies[code];
        lobby.players = lobby.players.filter((p) => p !== socket.id);
        delete lobby.hands[socket.id];
        delete lobby.stands[socket.id];

        // If lobby empty, delete it
        if (lobby.players.length === 0) {
          delete lobbies[code];
        } else {
          io.to(code).emit("updatePlayers", lobby.players);

          // If current player left, advance turn
          if (lobby.players[lobby.currentTurnIndex] === socket.id) {
            const nextPlayerId = advanceTurn(lobby);
            if (nextPlayerId) {
              lobby.currentTurnIndex = lobby.players.indexOf(nextPlayerId);
              io.to(code).emit("playerTurn", nextPlayerId);
            }
          }
        }
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
