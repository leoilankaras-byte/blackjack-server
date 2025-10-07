const socket = io();

let lobbyCode = null;
let playerId = null;
let players = [];
let isHost = false;
let gameStarted = false;

// DOM elements
const createLobbyBtn = document.getElementById("createLobbyBtn");
const joinLobbyBtn = document.getElementById("joinLobbyBtn");
const joinLobbyInput = document.getElementById("joinLobbyInput");
const lobbyMessage = document.getElementById("lobbyMessage");
const playersUl = document.getElementById("playersUl");
const startGameBtn = document.getElementById("startGameBtn");

const lobbySection = document.getElementById("lobbySection");
const gameSection = document.getElementById("gameSection");

const playersContainer = document.getElementById("playersContainer");
const turnMessage = document.getElementById("turnMessage");
const controls = document.getElementById("controls");
const hitBtn = document.getElementById("hitBtn");
const standBtn = document.getElementById("standBtn");
const gameResult = document.getElementById("gameResult");

// Create Lobby
createLobbyBtn.onclick = () => {
  socket.emit("createLobby");
  lobbyMessage.textContent = "Creating lobby...";
};

// Join Lobby
joinLobbyBtn.onclick = () => {
  const code = joinLobbyInput.value.trim().toUpperCase();
  if (code.length !== 6) {
    lobbyMessage.textContent = "Enter a valid 6-character lobby code.";
    return;
  }
  socket.emit("joinLobby", code);
  lobbyMessage.textContent = `Joining lobby ${code}...`;
};

// Host starts game
startGameBtn.onclick = () => {
  if (lobbyCode && isHost) {
    socket.emit("startGame", lobbyCode);
  }
};

// When connected, save your playerId
socket.on("connect", () => {
  playerId = socket.id;
});

// Lobby created — you are host
socket.on("lobbyCreated", (code) => {
  lobbyCode = code;
  isHost = true;
  gameStarted = false;
  lobbyMessage.textContent = `Lobby created! Code: ${code}`;
  updatePlayers([]);
  startGameBtn.style.display = "inline-block";
  lobbySection.style.display = "block";
  gameSection.style.display = "none";
});

// Lobby joined — you are not host
socket.on("lobbyJoined", (code, lobbyPlayers) => {
  lobbyCode = code;
  isHost = false;
  gameStarted = false;
  lobbyMessage.textContent = `Joined lobby ${code}`;
  updatePlayers(lobbyPlayers);
  startGameBtn.style.display = "none";
  lobbySection.style.display = "block";
  gameSection.style.display = "none";
});

// Update players list
socket.on("updatePlayers", (lobbyPlayers) => {
  players = lobbyPlayers;
  updatePlayers(players);
});

// Lobby error
socket.on("lobbyError", (msg) => {
  lobbyMessage.textContent = `Error: ${msg}`;
});

// Game started
socket.on("gameStarted", (gameData) => {
  gameStarted = true;
  lobbySection.style.display = "none";
  gameSection.style.display = "block";
  gameResult.textContent = "";
  turnMessage.textContent = "Game has started!";
  setupGameUI(gameData);
});

// Update players list UI
function updatePlayers(lobbyPlayers) {
  playersUl.innerHTML = "";
  lobbyPlayers.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p === playerId ? "You" : `Player ${p.slice(0, 5)}`;
    playersUl.appendChild(li);
  });
}

// Convert card object or string to display string (e.g. "A♠")
function cardToString(card) {
  if (typeof card === "string") return card;
  return `${card.rank}${card.suit}`;
}

// Setup the game UI after game starts
function setupGameUI(gameData) {
  playersContainer.innerHTML = "";
  gameData.players.forEach((p) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "player";
    playerDiv.id = `player-${p.id}`;

    const nameText = p.id === playerId ? "You" : `Player ${p.id.slice(0, 5)}`;
    playerDiv.innerHTML = `<h4>${nameText}</h4><div class="cards" id="cards-${p.id}"></div>`;

    playersContainer.appendChild(playerDiv);

    const cardsDiv = document.getElementById(`cards-${p.id}`);
    cardsDiv.innerHTML = "";

    p.cards.forEach((card, idx) => {
      const cardEl = document.createElement("div");
      cardEl.className = "card";

      // Your cards shown face up, others show first card face down if gameData.showAllCards is false
      if (p.id === playerId) {
        cardEl.textContent = cardToString(card);
      } else {
        if (idx === 0 && !gameData.showAllCards) {
          cardEl.classList.add("back");
          cardEl.textContent = "";
        } else {
          cardEl.textContent = cardToString(card);
        }
      }

      cardsDiv.appendChild(cardEl);
    });
  });

  // Hide controls by default, only show if it's your turn
  controls.style.display = "none";
}

// Hit button
hitBtn.onclick = () => {
  socket.emit("hit", { lobbyCode });
};

// Stand button
standBtn.onclick = () => {
  socket.emit("stand", { lobbyCode });
};

// Server tells whose turn it is
socket.on("playerTurn", (currentPlayerId) => {
  if (currentPlayerId === playerId) {
    controls.style.display = "block";
    turnMessage.textContent = "Your turn!";
  } else {
    controls.style.display = "none";
    turnMessage.textContent = `Waiting for Player ${currentPlayerId.slice(0, 5)}...`;
  }
});

// Update game state with new cards and info
socket.on("gameStateUpdate", (gameData) => {
  setupGameUI(gameData);
});

// Show game over message
socket.on("gameOver", (resultData) => {
  controls.style.display = "none";
  turnMessage.textContent = "Game over!";
  gameResult.textContent = resultData.message;
});
