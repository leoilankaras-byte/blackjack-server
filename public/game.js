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

let currentTurnPlayer = null;

// Buttons handlers
createLobbyBtn.onclick = () => {
  socket.emit("createLobby");
  lobbyMessage.textContent = "Creating lobby...";
};

joinLobbyBtn.onclick = () => {
  const code = joinLobbyInput.value.trim().toUpperCase();
  if (code.length !== 6) {
    lobbyMessage.textContent = "Enter a valid 6-character lobby code.";
    return;
  }
  socket.emit("joinLobby", code);
  lobbyMessage.textContent = `Joining lobby ${code}...`;
};

startGameBtn.onclick = () => {
  if (lobbyCode && isHost) {
    socket.emit("startGame", lobbyCode);
  }
};

hitBtn.onclick = () => {
  socket.emit("hit", lobbyCode);
};

standBtn.onclick = () => {
  socket.emit("stand", lobbyCode);
};

// Socket events

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
  gameResult.textContent = "";
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
  gameResult.textContent = "";
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
  turnMessage.textContent = "";

  currentTurnPlayer = gameData.currentPlayer;

  renderGame(gameData);
  updateTurnMessage();
});

socket.on("gameStateUpdate", (gameData) => {
  currentTurnPlayer = gameData.currentPlayer;
  renderGame(gameData);
  updateTurnMessage();
});

socket.on("gameOver", (results) => {
  gameStarted = false;
  controls.style.display = "none";

  const yourResult = results.find(r => r.id === playerId);
  if (!yourResult) {
    gameResult.textContent = "Game ended.";
  } else {
    gameResult.textContent = `Game over! Your result: ${yourResult.result}`;
  }
  turnMessage.textContent = "";
});

// Helper functions

function updatePlayers(lobbyPlayers) {
  playersUl.innerHTML = "";
  lobbyPlayers.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p === playerId ? "You" : `Player ${p.slice(0,5)}`;
    playersUl.appendChild(li);
  });
}

function renderGame(gameData) {
  playersContainer.innerHTML = "";

  gameData.players.forEach(player => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "player";
    if (player.id === currentTurnPlayer) playerDiv.style.boxShadow = "0 0 15px 3px #ff0";

    const nameText = player.id === playerId ? "You" : `Player ${player.id.slice(0,5)}`;
    playerDiv.innerHTML = `<h4>${nameText}</h4><div class="cards"></div><p>Score: ${player.stood || player.busted ? player.score : "?"}</p>`;

    const cardsDiv = playerDiv.querySelector(".cards");

    player.cards.forEach((card, idx) => {
      const cardDiv = document.createElement("div");
      cardDiv.className = "card";
      if (player.id === playerId) {
        // Show your cards face up
        cardDiv.textContent = `${card.rank}${card.suit}`;
      } else {
        // Show only first card face down, rest face up for others
        if (idx === 0) {
          cardDiv.classList.add("back");
          cardDiv.textContent = "";
        } else {
          cardDiv.textContent = `${card.rank}${card.suit}`;
        }
      }
      cardsDiv.appendChild(cardDiv);
    });

    playersContainer.appendChild(playerDiv);
  });

  // Show controls only if it's your turn and game is active
  if (gameStarted && currentTurnPlayer === playerId) {
    controls.style.display = "block";
  } else {
    controls.style.display = "none";
  }
}

function updateTurnMessage() {
  if (!gameStarted) {
    turnMessage.textContent = "";
    return;
  }
  if (currentTurnPlayer === playerId) {
    turnMessage.textContent = "Your turn! Hit or Stand?";
  } else {
    turnMessage.textContent = `Waiting for Player ${currentTurnPlayer.slice(0,5)}...`;
  }
}
