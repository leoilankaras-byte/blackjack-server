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

// Handle Create Lobby button
createLobbyBtn.onclick = () => {
  socket.emit("createLobby");
  lobbyMessage.textContent = "Creating lobby...";
};

// Handle Join Lobby button
joinLobbyBtn.onclick = () => {
  const code = joinLobbyInput.value.trim().toUpperCase();
  if (code.length !== 6) {
    lobbyMessage.textContent = "Enter a valid 6-character lobby code.";
    return;
  }
  socket.emit("joinLobby", code);
  lobbyMessage.textContent = `Joining lobby ${code}...`;
};

// Host-only Start Game button
startGameBtn.onclick = () => {
  if (lobbyCode && isHost) {
    socket.emit("startGame", lobbyCode);
  }
};

// Socket event handlers

socket.on("connect", () => {
  playerId = socket.id;
});

// Lobby created (you are host)
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

// Lobby joined (you are not host)
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

// Update players list when someone joins/leaves
socket.on("updatePlayers", (lobbyPlayers) => {
  players = lobbyPlayers;
  updatePlayers(players);
});

// Lobby errors
socket.on("lobbyError", (msg) => {
  lobbyMessage.textContent = `Error: ${msg}`;
});

// Game started event — show game UI
socket.on("gameStarted", (gameData) => {
  gameStarted = true;
  lobbySection.style.display = "none";
  gameSection.style.display = "block";
  gameResult.textContent = "";
  turnMessage.textContent = "Game has started!";
  
  // Initialize game UI here (cards, players etc)
  setupGameUI(gameData);
});

// Helper to update players list UI
function updatePlayers(lobbyPlayers) {
  playersUl.innerHTML = "";
  lobbyPlayers.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p === playerId ? "You" : `Player ${p.slice(0,5)}`;
    playersUl.appendChild(li);
  });
}

// Setup game UI after start
function setupGameUI(gameData) {
  playersContainer.innerHTML = "";
  gameData.players.forEach((p) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "player";
    playerDiv.id = `player-${p}`;

    const nameText = p === playerId ? "You" : `Player ${p.slice(0,5)}`;
    playerDiv.innerHTML = `<h4>${nameText}</h4><div class="cards" id="cards-${p}"></div>`;
    
    playersContainer.appendChild(playerDiv);

    // For demonstration, show 1 face-down card only to the player
    const cardsDiv = playerDiv.querySelector(`#cards-${p}`);

    if (p === playerId) {
      // Your card: face down (only you see it)
      cardsDiv.innerHTML = `<div class="card back"></div>`;
    } else {
      // Other players’ cards face up
      cardsDiv.innerHTML = `<div class="card">??</div>`;
    }
  });

  // Show controls only to current player (simplified, you’d want turn logic)
  if (players.includes(playerId)) {
    controls.style.display = "block";
  } else {
    controls.style.display = "none";
  }
}

// Add your hit and stand button handlers (emit events to server)
hitBtn.onclick = () => {
  socket.emit("hit", { lobbyCode });
};

standBtn.onclick = () => {
  socket.emit("stand", { lobbyCode });
};

// TODO: Add socket listeners for hit/stand results, game updates, turns, etc.

