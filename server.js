const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const lobbies = {};

const suits = ["♠", "♥", "♦", "♣"];
const ranks = [
  { rank: "A", value: 11 },
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 10 },
  { rank: "Q", value: 10 },
  { rank: "K", value: 10 },
];

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const r of ranks) {
      deck.push({ ...r, suit });
    }
  }
  return shuffle(deck);
}

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("createLobby", ({ name }) => {
    const code = nanoid(6).toUpperCase();
    lobbies[code] = {
      hostId: socket.id,
      players: [],
      deck: [],
      currentPlayerIndex: 0,
      inGame: false,
    };
    // existing logic...
  });

  socket.on("joinLobby", ({ code, name }) => {
    // existing logic...
  });

  // Add this listener here:
  socket.on("startGame", (lobbyCode) => {
    startGame(lobbyCode);
  });

  // Other listeners...
});


    const player = {
      id: socket.id,
      name,
      cards: [],
      isStanding: false,
    };

    lobbies[code].players.push(player);
    socket.join(code);
    socket.emit("lobbyCreated", code);
    io.to(code).emit("updatePlayers", lobbies[code].players);
  });

  socket.on("joinLobby", ({ code, name }) => {
    const lobby = lobbies[code];
    if (!lobby) {
      socket.emit("lobbyError", "Lobby not found.");
      return;
    }

    if (lobby.inGame) {
      socket.emit("lobbyError", "Game already in progress.");
      return;
    }

    const player = {
      id: socket.id,
      name,
      cards: [],
      isStanding: false,
    };

    lobby.players.push(player);
    socket.join(code);
    socket.emit("lobbyJoined", code, lobby.players);
    io.to(code).emit("updatePlayers", lobby.players);
  });

  socket.on("startGame", (code) => {
    const lobby = lobbies[code];
    if (!lobby) return;

    lobby.inGame = true;
    lobby.deck = createDeck();
    lobby.currentPlayerIndex = 0;

    // Deal 2 cards to each player
    for (const player of lobby.players) {
      player.cards = [lobby.deck.pop(), lobby.deck.pop()];
      player.isStanding = false;
    }

    const gameData = {
      players: lobby.players,
      showAllCards: false,
    };

    io.to(code).emit("gameStarted", gameData);

    const currentPlayer = lobby.players[lobby.currentPlayerIndex];
    io.to(code).emit("playerTurn", currentPlayer.id);
  });

  socket.on("hit", ({ lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    const player = lobby.players[lobby.currentPlayerIndex];
    if (!player || player.id !== socket.id) return;

    const card = lobby.deck.pop();
    player.cards.push(card);

    const total = calculateHandValue(player.cards);
    if (total > 21) {
      player.isStanding = true;
      advanceTurn(lobbyCode);
    }

    sendGameState(lobbyCode);
  });

  socket.on("stand", ({ lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    const player = lobby.players[lobby.currentPlayerIndex];
    if (!player || player.id !== socket.id) return;

    player.isStanding = true;

    advanceTurn(lobbyCode);
    sendGameState(lobbyCode);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    for (const code in lobbies) {
      const lobby = lobbies[code];
      const index = lobby.players.findIndex((p) => p.id === socket.id);
      if (index !== -1) {
        lobby.players.splice(index, 1);
        io.to(code).emit("updatePlayers", lobby.players);

        // If host left or no players, destroy the lobby
        if (lobby.players.length === 0 || lobby.hostId === socket.id) {
          delete lobbies[code];
        }
      }
    }
  });
});

// Utility Functions

function calculateHandValue(cards) {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += card.value;
    if (card.rank === "A") aces++;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function advanceTurn(code) {
  const lobby = lobbies[code];
  if (!lobby) return;

  const players = lobby.players;

  do {
    lobby.currentPlayerIndex++;
  } while (
    lobby.currentPlayerIndex < players.length &&
    players[lobby.currentPlayerIndex].isStanding
  );

  if (lobby.currentPlayerIndex >= players.length) {
    endGame(code);
  } else {
    const currentPlayer = players[lobby.currentPlayerIndex];
    io.to(code).emit("playerTurn", currentPlayer.id);
  }
}

function endGame(code) {
  const lobby = lobbies[code];
  if (!lobby) return;

  lobby.inGame = false;

  let highest = 0;
  let winners = [];

  for (const player of lobby.players) {
    const total = calculateHandValue(player.cards);
    if (total <= 21) {
      if (total > highest) {
        highest = total;
        winners = [player];
      } else if (total === highest) {
        winners.push(player);
      }
    }
  }

  let message;
  if (winners.length === 0) {
    message = "All players busted!";
  } else if (winners.length === 1) {
    message = `${winners[0].name} wins with ${highest}!`;
  } else {
    const names = winners.map((p) => p.name).join(", ");
    message = `Tie between: ${names} (${highest})`;
  }

  const gameData = {
    players: lobby.players,
    showAllCards: true,
  };

  io.to(code).emit("gameStateUpdate", gameData);
  io.to(code).emit("gameOver", { message });
}

function sendGameState(code) {
  const lobby = lobbies[code];
  if (!lobby) return;

  const gameData = {
    players: lobby.players,
    showAllCards: false,
  };

  io.to(code).emit("gameStateUpdate", gameData);
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
