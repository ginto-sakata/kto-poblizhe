// public/client.js

const socket = io(); // Connect to the server

//=================================================================================
//                           --- DOM Elements ---
//=================================================================================
// (Keep all your getElementById calls here)
const joinView = document.getElementById('join-view');
const nameInput = document.getElementById('player-name-input');
const joinButton = document.getElementById('join-button');
const joinError = document.getElementById('join-error');
const avatarContainer = document.getElementById('avatar-container');
const randomizeAvatarButton = document.getElementById('randomize-avatar');
const joinCurrentPlayers = document.getElementById('current-players');
const joinMaxPlayers = document.getElementById('max-players');
const joinHostName = document.getElementById('host-name');
const joinPlayerList = document.getElementById('player-list');
const lobbyStatusWrapper = document.getElementById('lobby-status-wrapper');
const opponentInfoPanel = document.getElementById('opponent-info-panel');
const lobbyView = document.getElementById('lobby-view');
const startGameButton = document.getElementById('start-game-button');
const settingsButton = document.getElementById('settings-button');
const leaveLobbyButton = document.getElementById('leave-lobby-button'); // Ensure this exists if used
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
// Add any other elements needed by event listeners

//=================================================================================
//                             --- Client State ---
//=================================================================================
let currentGameState = { players: [] }; // Initialize safely
let myPlayerId = null;
let isHost = false;
let lastRoundResultsMessage = null; // Store last round results
let currentAvatarOptions = null; // Stores the current selected/randomized avatar options

//=================================================================================
//                         --- Socket Event Handlers ---
//=================================================================================

socket.on('connect', () => {
    if(connectionStatusSpan) {
        connectionStatusSpan.textContent = 'Connected';
        connectionStatusSpan.style.color = 'green';
    }
    myPlayerId = socket.id;
    console.log('Connected to server with ID:', myPlayerId);
    if (joinButton) joinButton.textContent = 'Create Lobby';
});

socket.on('disconnect', () => {
    if(connectionStatusSpan) {
        connectionStatusSpan.textContent = 'Disconnected';
        connectionStatusSpan.style.color = 'red';
    }
    showView('join-view'); // Use the function from uiUpdater.js
    alert('Disconnected from server.');
});

socket.on('gameError', (message) => {
    console.error('Game Error:', message);
    const currentView = document.querySelector('.view[style*="block"]');
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

    if(joinButton) {
        joinButton.textContent = currentGameState.players?.length === 0 ? 'Create Lobby' : 'Join Game';
        joinButton.disabled = false;
    }
     if (submitAnswerButton && answerInput && currentGameState.phase === 'playing') {
         const me = currentGameState.players?.find(p => p.id === myPlayerId);
         if (me && !me.hasAnsweredThisRound) {
             answerInput.disabled = false;
             submitAnswerButton.disabled = false;
         }
     }
});

socket.on('updateState', (newState) => {
  console.log('Received state update:', newState.phase, newState);
  const oldPhase = currentGameState.phase;
  const oldQuestionNum = currentGameState.currentQuestion ? currentGameState.currentQuestion['№'] : null;

  currentGameState = newState;
  myPlayerId = newState.myId || socket.id;
  isHost = newState.hostId === myPlayerId;

  const newQuestionNum = newState.currentQuestion ? newState.currentQuestion['№'] : null;
  if (newState.phase === 'playing' && oldQuestionNum !== newQuestionNum && answerInput) {
      answerInput.value = '';
      if (oldPhase !== 'playing' && oldPhase !== 'round_end') {
           lastRoundResultsMessage = null;
      }
  }
  // Store round results message when transitioning *out* of round_end
  if (oldPhase === 'round_end' && newState.phase !== 'round_end' && currentGameState.roundResults?.message) {
      lastRoundResultsMessage = currentGameState.roundResults.message;
  }
  // Clear results message when going back to lobby/join
  if (newState.phase === 'lobby' && oldPhase !== 'lobby') {
      lastRoundResultsMessage = null;
  }


  const playerIsInGame = newState.players?.some(p => p.id === myPlayerId);

  // Determine which right-side panel to show in Join View
  let opponent = null;
  if (newState.players && newState.players.length > 1) {
      opponent = newState.players.find(p => p.id !== myPlayerId);
  }

  // Show/hide the correct panel within the right-join-panel
  if (lobbyStatusWrapper) {
      lobbyStatusWrapper.style.display = opponent ? 'none' : 'block';
      if (!opponent) {
          updateLobbyStatusPanel(newState); // Use function from uiUpdater.js
      }
  }
  if (opponentInfoPanel) {
      opponentInfoPanel.style.display = opponent ? 'flex' : 'none';
      if (opponent) {
          updateOpponentInfoPanel(opponent); // Use function from uiUpdater.js
      }
  }

  // Control Lobby View visibility (below Join View)
  if (lobbyView) {
      if (playerIsInGame && newState.phase === 'lobby') {
          lobbyView.style.display = 'block';
          updateLobbyView(newState, isHost); // Use function from uiUpdater.js
      } else {
          lobbyView.style.display = 'none';
      }
  }

  // Handle main view transitions using showView from uiUpdater.js
  switch (newState.phase) {
      case 'lobby':
        if (!playerIsInGame) {
            showView('join-view');
            if(lobbyView) lobbyView.style.display = 'none';
        } else {
            if (joinView) joinView.style.display = 'flex';
            if (settingsView) settingsView.style.display = 'none';
            if (gameplayView) gameplayView.style.display = 'none';
            if (roundEndView) roundEndView.style.display = 'none';
            if (gameOverView) gameOverView.style.display = 'none';
        }
      break;
      case 'settings':
           if (isHost) {
               showView('settings-view');
               updateSettingsView(newState, isHost); // Use function from uiUpdater.js
           } else if (playerIsInGame) {
               if (joinView) joinView.style.display = 'flex';
               if (lobbyView) lobbyView.style.display = 'block';
               updateLobbyView(newState, isHost); // Use function from uiUpdater.js
               if (settingsView) settingsView.style.display = 'none';
               if (gameplayView) gameplayView.style.display = 'none';
               if (roundEndView) roundEndView.style.display = 'none';
               if (gameOverView) gameOverView.style.display = 'none';
           } else {
               showView('join-view');
           }
           break;
      case 'playing':
          showView('gameplay-view');
          updateGameplayView(newState, myPlayerId, lastRoundResultsMessage); // Use function from uiUpdater.js
          break;
       case 'round_end':
           showView('round-end-view');
           updateRoundEndView(newState); // Use function from uiUpdater.js
          break;
      case 'game_over':
          showView('game-over-view');
          updateGameOverView(newState, isHost); // Use function from uiUpdater.js
          break;
      default:
          showView('join-view');
          if(lobbyView) lobbyView.style.display = 'none';
  }

  // Update Join Button state
  if (joinButton) {
    if (playerIsInGame) {
        joinButton.textContent = 'Leave Lobby 🚪';
        joinButton.disabled = false;
        joinButton.classList.remove('bg-gradient-to-r', 'from-blue-600', 'to-blue-500', 'hover:from-blue-700', 'hover:to-blue-600');
        joinButton.classList.add('bg-red-600', 'hover:bg-red-700');
        if (nameInput) nameInput.disabled = true;
    } else {
        joinButton.textContent = newState.players?.length === 0 ? 'Create Lobby' : 'Join Game';
        joinButton.disabled = false;
        joinButton.classList.remove('bg-red-600', 'hover:bg-red-700');
        joinButton.classList.add('bg-gradient-to-r', 'from-blue-600', 'to-blue-500', 'hover:from-blue-700', 'hover:to-blue-600');
        if (nameInput) nameInput.disabled = false;
    }
  }
});

//=================================================================================
//                             --- Event Listeners ---
//=================================================================================
// (Keep all your addEventListener calls here)

if (joinButton) {
  joinButton.addEventListener('click', () => {
      const playerIsInGame = currentGameState.players?.some(p => p.id === myPlayerId);

      if (playerIsInGame) {
          console.log('Main action button clicked while joined - emitting leaveLobby');
          socket.emit('leaveLobby');
          joinButton.disabled = true;
          joinButton.textContent = 'Leaving... 🚪';
      } else {
          const name = nameInput ? nameInput.value.trim() : null;
          if (name && currentAvatarOptions) {
              if (joinError) joinError.textContent = '';
              const isCreating = currentGameState.players?.length === 0;
              joinButton.textContent = isCreating ? 'Creating...' : 'Joining...';
              joinButton.disabled = true;

              const joinData = {
                  name: name,
                  avatarOptions: currentAvatarOptions
              };
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

if (nameInput && joinButton) {
    nameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinButton.click(); });
}

if (startGameButton) {
    startGameButton.addEventListener('click', () => {
        const lobbyMessage = document.getElementById('lobby-message');
        if (lobbyMessage) lobbyMessage.textContent = "Starting game...";
        socket.emit('startGame');
    });
}

if (leaveLobbyButton) {
  leaveLobbyButton.addEventListener('click', () => {
      console.log('Leave button clicked - emitting leaveLobby');
      socket.emit('leaveLobby');
  });
}

if (settingsButton) {
    settingsButton.addEventListener('click', () => {
         if (isHost) {
            showView('settings-view'); // Use function from uiUpdater.js
            updateSettingsView(currentGameState, isHost); // Use function from uiUpdater.js
         }
    });
}

if (cancelSettingsButton) {
    cancelSettingsButton.addEventListener('click', () => {
        if (settingsError) settingsError.textContent = '';
        if (joinView) joinView.style.display = 'flex'; // Use flex for join view
        if (lobbyView) lobbyView.style.display = 'block';
        if (settingsView) settingsView.style.display = 'none';
        updateLobbyView(currentGameState, isHost); // Use function from uiUpdater.js
    });
}

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


        const selectedThemes = settingsThemesListDiv
            ? Array.from(settingsThemesListDiv.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value)
            : [];
        const selectedAnswerTypes = settingsAnswerTypesListDiv
            ? Array.from(settingsAnswerTypesListDiv.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value)
            : [];

        if (selectedThemes.length === 0 || selectedAnswerTypes.length === 0) {
            if (settingsError) settingsError.textContent = 'Please select at least one theme and one answer type.';
            return;
        }

        const newSettings = {
            maxPlayers: settingsMaxPlayersSelect ? settingsMaxPlayersSelect.value : 4,
            gameMode: settingsGameModeSelect ? settingsGameModeSelect.value : 'score',
            targetScore: settingsTargetScoreInput ? settingsTargetScoreInput.value : 10,
            useAi: settingsAiModeSelect ? settingsAiModeSelect.value : 'never',
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

if (answerInput && submitAnswerButton) {
    answerInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitAnswerButton.click(); });
}

if (playAgainButton) {
    playAgainButton.addEventListener('click', () => {
         if (isHost || currentGameState.players?.length === 0) {
            console.log("Requesting game reset...");
            socket.emit('requestReset');
         }
    });
}

//=================================================================================
//                               DOMContentLoaded
//=================================================================================

document.addEventListener('DOMContentLoaded', () => {
    const savedName = getLocalStorage('playerName');
    const savedAvatarOptions = getLocalStorage('playerAvatar');

    if (savedName && nameInput) {
        nameInput.value = savedName;
    }

    function generateAndDisplayAvatar(forceRandom = false) {
        if (typeof Avataaars === 'undefined' || typeof getRandomAvatarOptions === 'undefined') {
            console.error("Avataaars library not loaded!");
            if (avatarContainer) avatarContainer.innerHTML = '<p class="text-red-500 text-xs p-2">Avatar Error</p>';
            return;
        }
        if (!avatarContainer) {
            console.error("Avatar container not found!");
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


    if (savedAvatarOptions) {
        currentAvatarOptions = savedAvatarOptions;
    } else {
        generateAndDisplayAvatar(true);
    }
    generateAndDisplayAvatar(false);


    if (randomizeAvatarButton) {
        randomizeAvatarButton.addEventListener('click', () => {
            generateAndDisplayAvatar(true);
        });
    }

    showView('join-view'); // Use function from uiUpdater.js
});


//=================================================================================
//                         --- Local Storage Helpers ---
//=================================================================================
function setLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error("Error saving to localStorage", e);
    }
}

function getLocalStorage(key) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    } catch (e) {
        console.error("Error reading from localStorage", e);
        return null;
    }
}