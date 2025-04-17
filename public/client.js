// public/client.js

const socket = io();

//============================= DOM Elements =============================

const joinView = document.getElementById('join-view');
const playerPanelDiv = document.getElementById('player-panel');
const rightJoinPanel = document.getElementById('right-join-panel');

//======================== --- Elements populated by JS ---
let nameInput, joinError, avatarContainer, randomizeAvatarButton, customizeAvatarButton;
let lobbyStatusWrapper, opponentInfoPanel, lobbyActionButton;
let joinCurrentPlayers, joinMaxPlayers, joinHostName, joinPlayerList;

//======================== --- Other View Elements ---
const lobbyView = document.getElementById('lobby-view');
const startGameButton = document.getElementById('start-game-button');
const settingsButton = document.getElementById('settings-button');
const leaveLobbyButton = document.getElementById('leave-lobby-button');

const settingsView = document.getElementById('settings-view');
const applySettingsButton = document.getElementById('apply-settings-button');
const cancelSettingsButton = document.getElementById('cancel-settings-button');
const settingsError = document.getElementById('settings-error');

const gameplayView = document.getElementById('gameplay-view');
const answerInput = document.getElementById('answer-input');
const submitAnswerButton = document.getElementById('submit-answer-button');
const answerFeedbackP = document.getElementById('answer-feedback');

const roundEndView = document.getElementById('round-end-view');

const gameOverView = document.getElementById('game-over-view');
const playAgainButton = document.getElementById('play-again-button');

const connectionStatusSpan = document.getElementById('connection-status');
const serverMessageP = document.getElementById('server-message');

//============================= Client State =============================

let currentGameState = { players: [] };
let myPlayerId = null;
let isHost = false;
let lastRoundResultsMessage = null;
let currentAvatarOptions = null;

//============================= Socket Event Handlers =============================

socket.on('connect', () => {
    if(connectionStatusSpan) {
        connectionStatusSpan.textContent = 'Connected';
        connectionStatusSpan.style.color = 'green';
    }
    myPlayerId = socket.id;
    console.log('Connected to server with ID:', myPlayerId);
    if (lobbyActionButton) lobbyActionButton.textContent = 'Create Lobby';
});

//============================= Disconnect Handler =============================

socket.on('disconnect', () => {
    if(connectionStatusSpan) {
        connectionStatusSpan.textContent = 'Disconnected';
        connectionStatusSpan.style.color = 'red';
    }
    showView('join-view');
    alert('Disconnected from server.');
});

//============================= Game Error Handler =============================

socket.on('gameError', (message) => {
    console.error('Game Error:', message);
    const currentView = document.querySelector('.view[style*="display"]:not([style*="none"])');
    let errorElement = currentView ? currentView.querySelector('.error-message, #join-error, #settings-error, #answer-feedback') : null;

    if (errorElement) {
        errorElement.textContent = message;
        setTimeout(() => { if(errorElement) errorElement.textContent = ''; }, 5000);
    } else if (serverMessageP) {
        serverMessageP.textContent = `Error: ${message}`;
        setTimeout(() => { serverMessageP.textContent = ''; }, 5000);
    } else {
        alert(`Error: ${message}`);
    }

    if(lobbyActionButton) {
        lobbyActionButton.textContent = currentGameState.players?.length === 0 ? 'Create Lobby' : 'Join Game';
        lobbyActionButton.disabled = false;
        const playerIsInGame = currentGameState.players?.some(p => p.id === myPlayerId);
        if (!playerIsInGame) {
            lobbyActionButton.classList.remove('bg-red-600', 'hover:bg-red-700');
            lobbyActionButton.classList.add('bg-gradient-to-r', 'from-blue-600', 'to-blue-500', 'hover:from-blue-700', 'hover:to-blue-600');
        }
    }
     if (submitAnswerButton && answerInput && currentGameState.phase === 'playing') {
         const me = currentGameState.players?.find(p => p.id === myPlayerId);
         if (me && !me.hasAnsweredThisRound) {
             answerInput.disabled = false;
             submitAnswerButton.disabled = false;
         }
     }
});

//============================= Update State Handler =============================

socket.on('updateState', (newState) => {
  console.log('Received state update:', newState.phase, newState);
  const oldPhase = currentGameState.phase;
  const oldQuestionNum = currentGameState.currentQuestion ? currentGameState.currentQuestion['№'] : null;

  currentGameState = newState;
  myPlayerId = newState.myId || socket.id;
  isHost = newState.hostId === myPlayerId;

  //======================== --- Clear inputs/results based on phase changes ---
  const newQuestionNum = newState.currentQuestion ? newState.currentQuestion['№'] : null;
  if (newState.phase === 'playing' && oldQuestionNum !== newQuestionNum && answerInput) {
      answerInput.value = '';
      if (oldPhase !== 'playing' && oldPhase !== 'round_end') {
           lastRoundResultsMessage = null;
      }
  }
  if (oldPhase === 'round_end' && newState.phase !== 'round_end' && currentGameState.roundResults?.message) {
      lastRoundResultsMessage = currentGameState.roundResults.message;
  }
  if (newState.phase === 'lobby' && oldPhase !== 'lobby') {
      lastRoundResultsMessage = null;
  }

  const playerIsInGame = newState.players?.some(p => p.id === myPlayerId);

  //======================== --- Update Right Panel in Join View ---
  let opponent = null;
  if (playerIsInGame && newState.players && newState.players.length > 1) {
      opponent = newState.players.find(p => p.id !== myPlayerId);
  }

  lobbyStatusWrapper = lobbyStatusWrapper || document.getElementById('lobby-status-wrapper');
  opponentInfoPanel = opponentInfoPanel || document.getElementById('opponent-info-panel');

  if (rightJoinPanel) {
      rightJoinPanel.classList.remove('bg-gray-100', 'bg-gradient-to-br', 'from-yellow-200', 'to-red-300');

      if (opponent) {
          if (lobbyStatusWrapper) lobbyStatusWrapper.style.display = 'none';
          if (opponentInfoPanel) {
              opponentInfoPanel.style.display = 'flex';
              updateOpponentInfoPanel(opponent);
          }
          rightJoinPanel.classList.add('bg-gradient-to-br', 'from-yellow-200', 'to-red-300');
      } else {
          if (opponentInfoPanel) opponentInfoPanel.style.display = 'none';
          if (lobbyStatusWrapper) {
              lobbyStatusWrapper.style.display = 'block';
              updateLobbyStatusPanel(newState);
          }
          rightJoinPanel.classList.add('bg-gray-100');
      }
  }


  //======================== --- Control Lobby View visibility ---
  if (lobbyView) {
      if (playerIsInGame && newState.phase === 'lobby') {
          lobbyView.style.display = 'block';
          updateLobbyView(newState, isHost);
      } else {
          lobbyView.style.display = 'none';
      }
  }

  //======================== --- Handle Main View Transitions ---
  [settingsView, gameplayView, roundEndView, gameOverView].forEach(view => {
      if (view) view.style.display = 'none';
  });
  if (joinView) joinView.style.display = 'none';

  switch (newState.phase) {
      case 'lobby':
        if (joinView) joinView.style.display = 'flex';
        break;
      case 'settings':
           if (isHost) {
               showView('settings-view');
               updateSettingsView(newState, isHost);
           } else if (playerIsInGame) {
               if (joinView) joinView.style.display = 'flex';
               if (lobbyView) lobbyView.style.display = 'block';
               updateLobbyView(newState, isHost);
           } else {
               if (joinView) joinView.style.display = 'flex';
           }
           break;
      case 'playing':
          showView('gameplay-view');
          updateGameplayView(newState, myPlayerId, lastRoundResultsMessage);
          break;
       case 'round_end':
           showView('round-end-view');
           updateRoundEndView(newState);
          break;
      case 'game_over':
          showView('game-over-view');
          updateGameOverView(newState, isHost);
          break;
      default:
          if (joinView) joinView.style.display = 'flex';
          if(lobbyView) lobbyView.style.display = 'none';
  }

  //======================== --- Update Lobby Action Button state ---
  lobbyActionButton = lobbyActionButton || document.getElementById('lobby-action-button');
  if (lobbyActionButton) {
    lobbyActionButton.style.display = 'block';
    if (playerIsInGame) {
        lobbyActionButton.textContent = 'Leave Lobby 🚪';
        lobbyActionButton.disabled = false;
        lobbyActionButton.classList.remove('bg-gradient-to-r', 'from-blue-600', 'to-blue-500', 'hover:from-blue-700', 'hover:to-blue-600');
        lobbyActionButton.classList.add('bg-red-600', 'hover:bg-red-700');
        if (nameInput) nameInput.disabled = true;
    } else {
        lobbyActionButton.textContent = newState.players?.length === 0 ? 'Create Lobby' : 'Join Game';
        lobbyActionButton.disabled = false;
        lobbyActionButton.classList.remove('bg-red-600', 'hover:bg-red-700');
        lobbyActionButton.classList.add('bg-gradient-to-r', 'from-blue-600', 'to-blue-500', 'hover:from-blue-700', 'hover:to-blue-600');
        if (nameInput) nameInput.disabled = false;
    }
  }

  //======================== --- Update Customize Button state ---
  customizeAvatarButton = customizeAvatarButton || document.getElementById('customize-avatar-button');
  if (customizeAvatarButton) {
      customizeAvatarButton.disabled = playerIsInGame;
  }
});

//============================= Event Listeners =============================

function attachEventListeners() {
    //======================== --- Re-fetch elements ---
    nameInput = document.getElementById('player-name-input');
    joinError = document.getElementById('join-error');
    avatarContainer = document.getElementById('avatar-container');
    randomizeAvatarButton = document.getElementById('randomize-avatar');
    customizeAvatarButton = document.getElementById('customize-avatar-button');
    lobbyActionButton = document.getElementById('lobby-action-button');
    const startGameButton = document.getElementById('start-game-button');
    const leaveLobbyButton = document.getElementById('leave-lobby-button');
    const settingsButton = document.getElementById('settings-button');
    const cancelSettingsButton = document.getElementById('cancel-settings-button');
    const applySettingsButton = document.getElementById('apply-settings-button');
    const settingsError = document.getElementById('settings-error');
    const submitAnswerButton = document.getElementById('submit-answer-button');
    const answerInput = document.getElementById('answer-input');
    const answerFeedbackP = document.getElementById('answer-feedback');
    const playAgainButton = document.getElementById('play-again-button');

    //======================== --- Lobby Action Button (Join/Create/Leave) ---
    if (lobbyActionButton) {
        lobbyActionButton.addEventListener('click', () => {
            const playerIsInGame = currentGameState.players?.some(p => p.id === myPlayerId);
            if (playerIsInGame) {
                console.log('Lobby action button clicked while joined - emitting leaveLobby');
                socket.emit('leaveLobby');
                lobbyActionButton.disabled = true;
                lobbyActionButton.textContent = 'Leaving... 🚪';
            } else {
                const name = nameInput ? nameInput.value.trim() : null;
                if (name && currentAvatarOptions) {
                    if (joinError) joinError.textContent = '';
                    const isCreating = currentGameState.players?.length === 0;
                    lobbyActionButton.textContent = isCreating ? 'Creating...' : 'Joining...';
                    lobbyActionButton.disabled = true;
                    const joinData = { name: name, avatarOptions: currentAvatarOptions };
                    socket.emit('joinGame', joinData);
                    setLocalStorage('playerName', name);
                    setLocalStorage('playerAvatar', currentAvatarOptions);
                } else if (!name && joinError) {
                    joinError.textContent = 'Please enter a name.';
                } else if (joinError) {
                    joinError.textContent = 'Avatar not generated yet.';
                }
            }
        });
    }

    //======================== --- Name Input Enter Key ---
    if (nameInput && lobbyActionButton) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !lobbyActionButton.disabled) {
                lobbyActionButton.click();
            }
        });
    }

    //======================== --- Customize Avatar Button ---
    if (customizeAvatarButton) {
        customizeAvatarButton.addEventListener('click', () => {
            console.log("Customize Avatar clicked (WIP)");
            alert("Avatar customization not implemented yet.");
        });
    }

    //======================== --- Randomize Avatar Button ---
     if (randomizeAvatarButton) {
         randomizeAvatarButton.addEventListener('click', () => {
             generateAndDisplayAvatar(true);
         });
     }


    //======================== --- Start Game Button ---
    if (startGameButton) {
        startGameButton.addEventListener('click', () => {
            const lobbyMessage = document.getElementById('lobby-message');
            const playerCount = currentGameState.players?.length || 0;
            const maxPlayers = currentGameState.maxPlayers || 2;

            if (playerCount > 0 && playerCount < maxPlayers) {
                const confirmStart = confirm(`Are you sure you want to start? The lobby is not full (${playerCount}/${maxPlayers} players).`);
                if (!confirmStart) {
                    if (lobbyMessage) lobbyMessage.textContent = '';
                    return;
                }
            }

            if (lobbyMessage) lobbyMessage.textContent = "Starting game...";
            socket.emit('startGame');
        });
    }

    //======================== --- Leave Lobby Button (Redundant?) ---
    if (leaveLobbyButton) {
      leaveLobbyButton.addEventListener('click', () => {
          console.log('Dedicated Leave button clicked - emitting leaveLobby');
          socket.emit('leaveLobby');
      });
    }

    //======================== --- Settings Button ---
    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
             if (isHost) {
                showView('settings-view');
                updateSettingsView(currentGameState, isHost);
             }
        });
    }

    //======================== --- Cancel Settings Button ---
    if (cancelSettingsButton) {
        cancelSettingsButton.addEventListener('click', () => {
            if (settingsError) settingsError.textContent = '';
            if (joinView) joinView.style.display = 'flex';
            if (lobbyView) lobbyView.style.display = 'block';
            if (settingsView) settingsView.style.display = 'none';
            updateLobbyView(currentGameState, isHost);
        });
    }

    //======================== --- Apply Settings Button ---
    if (applySettingsButton) {
        applySettingsButton.addEventListener('click', () => {
            if (!isHost) return;
            if (settingsError) settingsError.textContent = '';

            const settingsThemesListDiv = document.getElementById('settings-themes-list');
            const settingsAnswerTypesListDiv = document.getElementById('settings-answer-types-list');
            const settingsMaxPlayersSelect = document.getElementById('settings-max-players');
            const settingsGameModeSelect = document.getElementById('settings-game-mode');
            const settingsTargetScoreInput = document.getElementById('settings-target-score');
            const settingsAiModeSelect = document.getElementById('settings-ai-mode');

            const selectedThemes = settingsThemesListDiv ? Array.from(settingsThemesListDiv.querySelectorAll('input:checked')).map(input => input.value) : [];
            const selectedAnswerTypes = settingsAnswerTypesListDiv ? Array.from(settingsAnswerTypesListDiv.querySelectorAll('input:checked')).map(input => input.value) : [];

            if (selectedThemes.length === 0 || selectedAnswerTypes.length === 0) {
                if (settingsError) settingsError.textContent = 'Please select at least one theme and one answer type.';
                return;
            }

            const newSettings = {
                maxPlayers: settingsMaxPlayersSelect ? settingsMaxPlayersSelect.value : 2,
                gameMode: settingsGameModeSelect ? settingsGameModeSelect.value : 'score',
                targetScore: settingsTargetScoreInput ? settingsTargetScoreInput.value : 10,
                useAi: settingsAiModeSelect ? settingsAiModeSelect.value : 'auto',
                selectedThemes: selectedThemes,
                selectedAnswerTypes: selectedAnswerTypes,
            };

            console.log("Sending settings change:", newSettings);
            socket.emit('changeSettings', newSettings);

            if (joinView) joinView.style.display = 'flex';
            if (lobbyView) lobbyView.style.display = 'block';
            if (settingsView) settingsView.style.display = 'none';
        });
    }

    //======================== --- Select/Deselect All Buttons ---
    document.querySelectorAll('.select-all-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetListId = button.getAttribute('data-target');
            if (targetListId) {
                document.querySelectorAll(`#${targetListId} input[type="checkbox"]`).forEach(checkbox => checkbox.checked = true);
            }
        });
    });

    document.querySelectorAll('.deselect-all-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetListId = button.getAttribute('data-target');
             if (targetListId) {
                document.querySelectorAll(`#${targetListId} input[type="checkbox"]`).forEach(checkbox => checkbox.checked = false);
             }
        });
    });

    //======================== --- Submit Answer Button ---
    if (submitAnswerButton && answerInput) {
        submitAnswerButton.addEventListener('click', () => {
            const answer = answerInput.value.trim();
            if (answer && !answerInput.disabled) {
                if (answerFeedbackP) answerFeedbackP.textContent = 'Submitting...';
                socket.emit('submitAnswer', answer);
                answerInput.disabled = true;
                submitAnswerButton.disabled = true;
                answerInput.classList.add('bg-gray-100');
            } else if (!answer && answerFeedbackP) {
                answerFeedbackP.textContent = 'Please enter an answer.';
            }
        });
    }

    //======================== --- Answer Input Listener (Sanitize) ---
    if (answerInput) {
        answerInput.addEventListener('input', (e) => {
            let value = e.target.value;
            // 1. Remove any characters that are not digits, '.', or '-'
            let sanitized = value.replace(/[^0-9.-]/g, '');

            // 2. Ensure '-' is only the first character if present
            if (sanitized.indexOf('-') > 0) {
                sanitized = (sanitized.startsWith('-') ? '-' : '') + sanitized.replace(/-/g, '');
            }

            // 3. Ensure only one '.' is present
            const firstDotIndex = sanitized.indexOf('.');
            if (firstDotIndex !== -1) {
                const beforeDot = sanitized.substring(0, firstDotIndex + 1);
                const afterDot = sanitized.substring(firstDotIndex + 1).replace(/\./g, '');
                sanitized = beforeDot + afterDot;
            }

            if (e.target.value !== sanitized) {
                 e.target.value = sanitized;
            }
        });
    }

    //======================== --- Answer Input Enter Key ---
    if (answerInput && submitAnswerButton) {
        answerInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !submitAnswerButton.disabled) submitAnswerButton.click(); });
    }

    //======================== --- Play Again Button ---
    if (playAgainButton) {
        playAgainButton.addEventListener('click', () => {
             if (isHost || currentGameState.players?.length === 0) {
                console.log("Requesting game reset...");
                socket.emit('requestReset');
             }
        });
    }
}

//============================= Initialization =============================

// --- Avatar Generation Function ---
function generateAndDisplayAvatar(forceRandom = false) {
    avatarContainer = avatarContainer || document.getElementById('avatar-container');
    if (typeof Avataaars === 'undefined' || typeof getRandomAvatarOptions === 'undefined') {
        console.error("Avataaars library not loaded!");
        if (avatarContainer) avatarContainer.innerHTML = '<p class="text-red-500 text-xs p-2">Avatar Error</p>';
        return;
    }
    if (!avatarContainer) {
        console.error("Avatar container element not found!");
        return;
    }

    try {
        if (forceRandom || !currentAvatarOptions) {
            currentAvatarOptions = getRandomAvatarOptions();
        }
        const svgString = Avataaars.create(currentAvatarOptions);
        avatarContainer.innerHTML = svgString;
    } catch (error) {
        console.error("Error generating avatar:", error);
        avatarContainer.innerHTML = '<p class="text-red-500 text-center text-xs p-4">Error loading avatar</p>';
    }
}

//============================= DOMContentLoaded =============================

document.addEventListener('DOMContentLoaded', () => {
    //======================== --- Load Panel HTML ---
    if (playerPanelDiv && typeof getPlayerPanelHTML === 'function') {
        playerPanelDiv.innerHTML = getPlayerPanelHTML();
    } else {
        console.error("Could not load player panel HTML.");
    }
    if (rightJoinPanel && typeof getRightJoinPanelHTML === 'function') {
        rightJoinPanel.innerHTML = getRightJoinPanelHTML();
    } else {
        console.error("Could not load right join panel HTML.");
    }

    //======================== --- Attach Event Listeners ---
    attachEventListeners();

    //======================== --- Load from localStorage ---
    const savedName = getLocalStorage('playerName');
    const savedAvatarOptions = getLocalStorage('playerAvatar');

    if (savedName && nameInput) {
        nameInput.value = savedName;
    }

    //======================== --- Initial Avatar ---
    if (savedAvatarOptions) {
        currentAvatarOptions = savedAvatarOptions;
    } else {
        generateAndDisplayAvatar(true);
    }
    generateAndDisplayAvatar(false);

    //======================== --- Initial View ---
    showView('join-view');
});

//============================= Local Storage Helpers =============================

function setLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error("Error saving to localStorage", e);
    }
}

//============================= Get Local Storage =============================

function getLocalStorage(key) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    } catch (e) {
        console.error("Error reading from localStorage", e);
        return null;
    }
}