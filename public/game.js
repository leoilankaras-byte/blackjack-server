const socket = io();

let lobbyCode = null;
let playerId = null;
let players = [];
let isHost = false;
let gameStarted = false;
let currentPlayerTurn = null;

// DOM elements
const nameInput = document.getElementById("nameInput");
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
const replayButton = document.getElementById("replay-button");


// === LOBBY CONTROLS ===

createLobbyBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) {
    lobbyMessage.textContent = "Please enter your name.";
    return;
  }
  socket.emit("createLobby", { name });
  lobbyMessage.textContent = "Creating lobby...";
};

joinLobbyBtn.onclick = () => {
  const code = joinLobbyInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  if (code.length !== 6) {
    lobbyMessage.textContent = "Enter a valid 6-character lobby code.";
    return;
  }
  if (!name) {
    lobbyMessage.textContent = "Please enter your name.";
    return;
  }
  socket.emit("joinLobby", { code, name });
  lobbyMessage.textContent = `Joining lobby ${code}...`;
};

startGameBtn.onclick = () => {
  if (lobbyCode && isHost) {
    socket.emit("startGame", lobbyCode);
  }
};

// === SOCKET EVENTS ===

socket.on("connect", () => {
  playerId = socket.id;
});

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

socket.on("updatePlayers", (lobbyPlayers) => {
  players = lobbyPlayers;
  updatePlayers(players);
});

socket.on("lobbyError", (msg) => {
  lobbyMessage.textContent = `Error: ${msg}`;
});

socket.on("gameStarted", (gameData) => {
  gameStarted = true;
  lobbySection.style.display = "none";
  gameSection.style.display = "block";
  gameResult.textContent = "";
  turnMessage.textContent = "Game has started!";
  updateGameUI(gameData);
});

socket.on("playerTurn", (currentPlayerId) => {
  currentPlayerTurn = currentPlayerId;
  if (currentPlayerId === playerId) {
    turnMessage.textContent = "Your turn! Hit or Stand.";
    controls.style.display = "block";
  } else {
    turnMessage.textContent = `Waiting for ${getPlayerName(currentPlayerId)} to play...`;
    controls.style.display = "none";
  }
});

socket.on("gameStateUpdate", (gameData) => {
  updateGameUI(gameData);
});

socket.on("gameOver", (result) => {
  turnMessage.textContent = "";
  controls.style.display = "none";
  gameResult.textContent = result.message;
});

// === UI HELPERS ===

function updatePlayers(lobbyPlayers) {
  playersUl.innerHTML = "";
  players = lobbyPlayers;
  lobbyPlayers.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.id === playerId ? `${p.name} (You)` : p.name;
    playersUl.appendChild(li);
  });
}

function updateGameUI(gameData) {
  playersContainer.innerHTML = "";
  players = gameData.players;

  gameData.players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "player";
    div.id = `player-${player.id}`;
    const name = player.id === playerId ? `${player.name} (You)` : player.name;

    const cardsHtml = player.cards
      .map((card, idx) => {
        if (player.id === playerId || gameData.showAllCards) {
          return `<div class="card">${card.rank}${card.suit}</div>`;
        }
        if (idx === 0) {
          return `<div class="card back">🂠</div>`;
        } else {
          return `<div class="card">${card.rank}${card.suit}</div>`;
        }
      })
      .join("");

    div.innerHTML = `<h4>${name}</h4><div class="cards">${cardsHtml}</div>`;
    playersContainer.appendChild(div);
  });
}

function getPlayerName(id) {
  const player = players.find((p) => p.id === id);
  return player ? player.name : `Player ${id.slice(0, 5)}`;
}

// === BUTTON EVENTS ===

hitBtn.onclick = () => {
  socket.emit("hit", { lobbyCode });
};

standBtn.onclick = () => {
  socket.emit("stand", { lobbyCode });
};
