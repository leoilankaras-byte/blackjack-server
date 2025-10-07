const socket = io();

const createLobbyBtn = document.getElementById("createLobbyBtn");
const joinLobbyBtn = document.getElementById("joinLobbyBtn");
const joinLobbyInput = document.getElementById("joinLobbyInput");
const lobbyMessage = document.getElementById("lobbyMessage");

const lobbySection = document.getElementById("lobbySection");
const gameSection = document.getElementById("gameSection");
const lobbyCodeSpan = document.getElementById("lobbyCode");
const playersContainer = document.getElementById("playersContainer");

const controls = document.getElementById("controls");
const hitBtn = document.getElementById("hitBtn");
const standBtn = document.getElementById("standBtn");

const turnMessage = document.getElementById("turnMessage");
const gameResult = document.getElementById("gameResult");

let currentLobby = null;
let playerId = null;
let players = {};
let currentTurn = null;

// === Utility: render card as DOM element ===
function createCardElement(card, faceDown = false) {
  const el = document.createElement("div");
  el.classList.add("card");
  if (faceDown) {
    el.classList.add("back");
  } else {
    // red suits are hearts & diamonds
    if (card.suit === "hearts" || card.suit === "diamonds") {
      el.classList.add("red");
    }
    el.innerHTML = `
      <div class="top-left">${card.rank}</div>
      <div class="suit">${getSuitSymbol(card.suit)}</div>
      <div class="bottom-right">${card.rank}</div>
    `;
  }
  return el;
}

function getSuitSymbol(suit) {
  switch (suit) {
    case "hearts": return "♥";
    case "diamonds": return "♦";
    case "clubs": return "♣";
    case "spades": return "♠";
  }
  return "";
}

// === Render all players and their hands ===
function renderPlayers(hands, turnId) {
  playersContainer.innerHTML = "";

  for (const id in hands) {
    const player = hands[id];
    const playerDiv = document.createElement("div");
    playerDiv.classList.add("player");
    if (turnId === id) playerDiv.classList.add("currentTurn");

    const name = (id === playerId) ? "You" : `Player ${id.slice(0, 5)}`;
    playerDiv.innerHTML = `<h3>${name} ${player.busted ? "💥 BUSTED!" : ""}</h3>`;

    const cardsDiv = document.createElement("div");
    cardsDiv.classList.add("cards");

    // For your own hand, show all cards face-up except the first one is face-down initially.
    if (id === playerId) {
      player.hand.forEach((card, index) => {
        // first card face down at game start, then show when turn?
        const faceDown = index === 0 && !player.hasTurnStarted;
        cardsDiv.appendChild(createCardElement(card, faceDown));
      });
    } else {
      // For others, show all cards face-up
      player.hand.forEach(card => {
        cardsDiv.appendChild(createCardElement(card, false));
      });
    }

    playerDiv.appendChild(cardsDiv);

    // Show hand value for self, or for others if they busted
    const valueText = (id === playerId || player.busted)
      ? `Value: ${player.value}`
      : `Value: ?`;

    const valueDiv = document.createElement("div");
    valueDiv.style.textAlign = "center";
    valueDiv.style.marginTop = "5px";
    valueDiv.textContent = valueText;
    playerDiv.appendChild(valueDiv);

    playersContainer.appendChild(playerDiv);
  }
}

// === Enable/Disable controls ===
function setControls(enabled) {
  hitBtn.disabled = !enabled;
  standBtn.disabled = !enabled;
  controls.classList.toggle("hidden", !enabled);
}

// === Socket events ===

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

socket.on("lobbyCreated", (code) => {
  currentLobby = code;
  playerId = socket.id;
  lobbyCodeSpan.textContent = code;
  lobbyMessage.textContent = `Lobby created! Code: ${code}`;
  lobbySection.classList.add("hidden");
  gameSection.classList.remove("hidden");
  gameResult.textContent = "";
});

socket.on("errorMessage", (msg) => {
  lobbyMessage.textContent = msg;
});

socket.on("playerJoined", (data) => {
  lobbyMessage.textContent = `Players in lobby: ${data.players.length}`;
});

socket.on("gameStarted", (data) => {
  players = {};
  currentLobby = currentLobby || data.lobbyCode;
  currentTurn = data.turn;
  playerId = socket.id;

  // Mark the player objects, add flag for first card face down
  for (const id of data.players) {
    players[id] = {
      hand: data.hands[id].hand,
      value: data.hands[id].value,
      busted: data.hands[id].busted,
      hasTurnStarted: false
    };
  }

  renderPlayers(players, currentTurn);
  updateTurnMessage();

  setControls(currentTurn === playerId);
  gameResult.textContent = "";
});

socket.on("playerUpdate", (data) => {
  if (!players[data.id]) return;

  players[data.id].hand = data.hand;
  players[data.id].value = data.value;
  players[data.id].busted = data.busted;

  // If it's this player’s turn, reveal the first card face up now
  if (data.id === currentTurn) {
    players[data.id].hasTurnStarted = true;
  }

  renderPlayers(players, currentTurn);
});

socket.on("turnChanged", (id) => {
  currentTurn = id;
  updateTurnMessage();
  setControls(currentTurn === playerId);
});

socket.on("gameOver", (hands) => {
  // Reveal all hands at game end
  for (const id in hands) {
    if (players[id]) {
      players[id].hand = hands[id].hand;
      players[id].value = hands[id].value;
      players[id].busted = hands[id].busted;
      players[id].hasTurnStarted = true;
    }
  }
  renderPlayers(players, null);
  turnMessage.textContent = "Game Over!";

  // Determine winner(s)
  let highest = 0;
  let winners = [];
  for (const id in players) {
    const val = players[id].value;
    if (val > 21) continue;
    if (val > highest) {
      highest = val;
      winners = [id];
    } else if (val === highest) {
      winners.push(id);
    }
  }

  if (winners.length === 0) {
    gameResult.textContent = "No winners — all busted!";
  } else if (winners.length === 1) {
    gameResult.textContent = (winners[0] === playerId)
      ? "You win! 🎉"
      : "Player " + winners[0].slice(0, 5) + " wins!";
  } else {
    gameResult.textContent = "It's a tie between " + winners.map(id => id === playerId ? "You" : `Player ${id.slice(0,5)}`).join(", ");
  }

  setControls(false);
});

socket.on("playerLeft", (id) => {
  delete players[id];
  lobbyMessage.textContent = `Player ${id.slice(0,5)} left the game.`;
  renderPlayers(players, currentTurn);
});

// Buttons handlers
hitBtn.onclick = () => {
  socket.emit("hit", currentLobby);
};

standBtn.onclick = () => {
  socket.emit("stand", currentLobby);
};

// Update the message showing whose turn it is
function updateTurnMessage() {
  if (!currentTurn) {
    turnMessage.textContent = "";
    setControls(false);
    return;
  }

  if (currentTurn === playerId) {
    turnMessage.textContent = "Your turn! Hit or Stand?";
  } else {
    turnMessage.textContent = `Waiting for Player ${currentTurn.slice(0,5)}...`;
    setControls(false);
  }
}
