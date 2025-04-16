// client.js

const socket = io(); // Connect to the server

// --- DOM Elements ---
// Join View Elements
const joinView = document.getElementById('join-view');
const nameInput = document.getElementById('player-name-input');
const joinButton = document.getElementById('join-button');
const joinError = document.getElementById('join-error');
const avatarContainer = document.getElementById('avatar-container'); // Added for avatar preview
const randomizeAvatarButton = document.getElementById('randomize-avatar'); // Added for button listener

// Join View - Lobby Status Panel Elements (Corrected Selectors)
const joinCurrentPlayers = document.getElementById('current-players');
const joinMaxPlayers = document.getElementById('max-players');
const joinHostName = document.getElementById('host-name');
const joinPlayerList = document.getElementById('player-list');
      
// Opponent Info Panel Elements (in Join View)
const lobbyStatusWrapper = document.getElementById('lobby-status-wrapper');
const opponentInfoPanel = document.getElementById('opponent-info-panel');
const opponentInfoAvatar = document.getElementById('opponent-info-avatar');
const opponentInfoName = document.getElementById('opponent-info-name');
const opponentInfoGames = document.getElementById('opponent-info-games');
const opponentInfoScore = document.getElementById('opponent-info-score');
const opponentInfoWins = document.getElementById('opponent-info-wins'); // Added for wins


// Lobby View Elements (IDs Renamed for Clarity/Consistency)
const lobbyView = document.getElementById('lobby-view');
const lobbyCurrentPlayersSpan = document.getElementById('lobby-current-players');
const lobbyMaxPlayersSpan = document.getElementById('lobby-max-players');
const lobbyPlayerListContainer = document.getElementById('lobby-player-list-container');
const lobbyHostNameSpan = document.getElementById('lobby-host-name'); // Shared with join view, careful usage needed if both visible
const gameModeSpan = document.getElementById('game-mode');
const aiModeSpan = document.getElementById('ai-mode');
// const llmModelSpan = document.getElementById('llm-model'); // Check if these exist in HTML
// const llmStatusSpan = document.getElementById('llm-status');
const filteredQuestionCountSpan = document.getElementById('filtered-question-count');
// const themesSelectedCountSpan = document.getElementById('themes-selected-count'); // Check if these exist
// const typesSelectedCountSpan = document.getElementById('types-selected-count'); // Check if these exist
const leaderboardList = document.getElementById('leaderboard-list');
const startGameButton = document.getElementById('start-game-button');
const settingsButton = document.getElementById('settings-button');
const leaveLobbyButton = document.getElementById('leave-lobby-button');
const lobbyMessage = document.getElementById('lobby-message');

// Settings View Elements
const settingsView = document.getElementById('settings-view');
const settingsMaxPlayersSelect = document.getElementById('settings-max-players');
const settingsGameModeSelect = document.getElementById('settings-game-mode');
const settingsTargetScoreInput = document.getElementById('settings-target-score');
const settingsAiModeSelect = document.getElementById('settings-ai-mode');
const settingsLlmStatusSpan = document.getElementById('settings-llm-status');
const settingsThemesListDiv = document.getElementById('settings-themes-list');
const settingsAnswerTypesListDiv = document.getElementById('settings-answer-types-list');
const settingsThemesCountSpan = document.getElementById('settings-themes-count');
const settingsThemesTotalSpan = document.getElementById('settings-themes-total');
const settingsTypesCountSpan = document.getElementById('settings-types-count');
const settingsTypesTotalSpan = document.getElementById('settings-types-total');
const settingsAvailableQuestionsSpan = document.getElementById('settings-available-questions');
const applySettingsButton = document.getElementById('apply-settings-button');
const cancelSettingsButton = document.getElementById('cancel-settings-button');
const settingsError = document.getElementById('settings-error');
const selectAllButtons = document.querySelectorAll('.select-all-btn');
const deselectAllButtons = document.querySelectorAll('.deselect-all-btn');

// Gameplay View Elements
const gameplayView = document.getElementById('gameplay-view');
const playerScoresDiv = document.getElementById('player-scores');
const previousRoundResultsDisplay = document.getElementById('previous-round-results-display');
const previousRoundResultsPre = previousRoundResultsDisplay ? previousRoundResultsDisplay.querySelector('pre') : null; // Safety check
const questionNumberH3 = document.getElementById('question-number');
const questionThemeSpan = document.getElementById('question-theme');
const questionSubthemeSpan = document.getElementById('question-subtheme');
const questionTextP = document.getElementById('question-text');
const answerInput = document.getElementById('answer-input');
const submitAnswerButton = document.getElementById('submit-answer-button');
const answerFeedbackP = document.getElementById('answer-feedback');
const submittedAnswersDiv = document.getElementById('submitted-answers');
const submittedAnswersList = document.getElementById('submitted-answers-list');

// Round End View Elements
const roundEndView = document.getElementById('round-end-view');
const roundResultsDiv = document.getElementById('round-results');
const roundResultsPre = roundResultsDiv ? roundResultsDiv.querySelector('pre') : null; // Safety check

// Game Over View Elements
const gameOverView = document.getElementById('game-over-view');
const gameOverReasonP = document.getElementById('game-over-reason');
const finalScoresList = document.getElementById('final-scores-list');
const playAgainButton = document.getElementById('play-again-button');

// Footer/Status Elements
const connectionStatusSpan = document.getElementById('connection-status');
const serverMessageP = document.getElementById('server-message');

// --- Client State ---
let currentGameState = {};
let myPlayerId = null;
let isHost = false;
let lastRoundResultsMessage = null; // Store last round results
let currentAvatarOptions = null; // Stores the current selected/randomized avatar options

// --- Utility Functions ---
function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = view.id === viewId ? 'block' : 'none';
    });
    // Clear errors/messages when changing views
    if (joinError) joinError.textContent = '';
    if (settingsError) settingsError.textContent = '';
    if (answerFeedbackP) answerFeedbackP.textContent = '';
}

function sanitizeHTML(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// --- Update UI Functions ---

// Function to render a player list item (used in both Join and Lobby views)
function renderPlayerListItem(player, isHostPlayer) {
    let avatarSvg = '';
    // Use the globally available Avataaars object from avatar.js
    if (player.avatarOptions && typeof Avataaars !== 'undefined') {
         const listAvatarOptions = { ...player.avatarOptions, width: '24px', height: '24px' };
         try {
            avatarSvg = Avataaars.create(listAvatarOptions);
         } catch(e) { console.error("Error rendering list avatar", e); }
    } else {
         avatarSvg = `<span class="inline-block w-6 h-6 rounded-full bg-gray-300 align-middle mr-2"></span>`; // Fallback
    }

    return `<li class="flex items-center gap-2 text-gray-700">
                ${avatarSvg}
                <span>${sanitizeHTML(player.name)} ${isHostPlayer ? '👑' : ''}</span>
            </li>`;
}


// Updates the elements specific to the Join View (including the Lobby Status panel within it)
function updateJoinView(state) {
     // Use the corrected variables for the Join View's status panel
     if (joinCurrentPlayers) joinCurrentPlayers.textContent = state.players?.length || 0;
     if (joinMaxPlayers) joinMaxPlayers.textContent = state.maxPlayers || '?';

     const host = state.players?.find(p => p.id === state.hostId);
     if (joinHostName) joinHostName.textContent = host ? sanitizeHTML(host.name) : 'N/A';

     if (joinPlayerList) {
        joinPlayerList.innerHTML = state.players?.length > 0
            ? state.players.map(p => renderPlayerListItem(p, p.id === state.hostId)).join('')
            : '<li class="text-gray-500 italic">(Empty)</li>';
     }

     // Update Join Button text based on whether a lobby exists
     if (joinButton) {
        joinButton.textContent = state.players?.length === 0 ? 'Create Lobby' : 'Join Game';
     }
}


// Updates the elements specific to the Lobby View
function updateLobbyView(state) {
    const playerCount = state.players?.length || 0;
    if (lobbyCurrentPlayersSpan) lobbyCurrentPlayersSpan.textContent = playerCount;
    if (lobbyMaxPlayersSpan) lobbyMaxPlayersSpan.textContent = state.maxPlayers || '?';

    // Update player list within the Lobby View
    if (lobbyPlayerListContainer) {
         lobbyPlayerListContainer.innerHTML = state.players?.length > 0
           ? state.players.map(p => renderPlayerListItem(p, p.id === state.hostId)).join('')
           : '<li class="text-gray-500 italic">(Empty)</li>';
    }

    const host = state.players?.find(p => p.id === state.hostId);
    // This assumes lobbyHostNameSpan refers to the element in the Lobby View's Game Info
    if (lobbyHostNameSpan) lobbyHostNameSpan.textContent = host ? sanitizeHTML(host.name) : 'N/A';

    if (gameModeSpan) {
        let modeDesc = state.settings.gameMode;
        if(modeDesc === 'score') modeDesc += ` (Target: ${state.settings.targetScore})`;
        gameModeSpan.textContent = modeDesc;
    }
    if (aiModeSpan) aiModeSpan.textContent = state.settings.useAi?.replace('_', ' ') || '?';
    // Removed llmModelSpan/llmStatusSpan logic - add back if needed and elements exist

    if (filteredQuestionCountSpan) filteredQuestionCountSpan.textContent = state.filteredQuestionCount ?? '?';
    // Removed themesSelectedCountSpan/typesSelectedCountSpan logic - add back if needed

    if (leaderboardList) {
        leaderboardList.innerHTML = state.leaderboard?.length > 0
            ? state.leaderboard.map((entry, index) => `<li class="truncate"><span class="font-semibold">${index + 1}.</span> ${sanitizeHTML(entry.name)} - ${entry.score} pts (${entry.wins} wins)</li>`).join('')
            : '<li class="text-gray-500 italic">(Empty)</li>';
    }

    if (startGameButton) {
        // Enable start button if the current player is the host and there's at least 1 player
        startGameButton.disabled = !isHost || playerCount < 1;
        startGameButton.title = !isHost ? "Only the host can start" : (playerCount < 1 ? "Need at least 1 player" : "Start the game");
    }

    if (lobbyMessage) lobbyMessage.textContent = '';
    if (settingsButton) settingsButton.style.display = isHost ? 'inline-block' : 'none';
}

// Updates the Settings View elements
function updateSettingsView(state) {
    const settings = state.settings;
    if (!settings) return; // Safety check

    if (settingsMaxPlayersSelect) settingsMaxPlayersSelect.value = state.maxPlayers;
    if (settingsGameModeSelect) settingsGameModeSelect.value = settings.gameMode;
    if (settingsTargetScoreInput) {
        settingsTargetScoreInput.value = settings.targetScore;
        settingsTargetScoreInput.style.display = settings.gameMode === 'score' ? 'inline-block' : 'none';
    }

    if (settingsAiModeSelect) {
        if (settings.llmAvailable) {
            settingsAiModeSelect.value = 'always'; // Default or restore last selection if needed
            settingsAiModeSelect.disabled = false;
            settingsAiModeSelect.classList.remove('bg-gray-100');
        } else {
            settingsAiModeSelect.value = 'never';
            settingsAiModeSelect.disabled = true;
            settingsAiModeSelect.classList.add('bg-gray-100');
        }
    }
    if (settingsLlmStatusSpan) settingsLlmStatusSpan.textContent = settings.llmAvailable ? `(${settings.llmModel})` : "(Not Available)";

    // Populate Themes Checkboxes
    if (settingsThemesListDiv && settings.availableThemes) {
        settingsThemesListDiv.innerHTML = settings.availableThemes.map(theme => {
            const isChecked = settings.selectedThemes?.includes(theme); // Add safety check
            const checkboxId = `theme-${theme.replace(/[^a-zA-Z0-9]/g, '-')}`;
            return `<label for="${checkboxId}" class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input type="checkbox" id="${checkboxId}" value="${sanitizeHTML(theme)}" ${isChecked ? 'checked' : ''} class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300">
                        <span>${sanitizeHTML(theme)}</span>
                    </label>`;
        }).join('');
    }
    if (settingsThemesCountSpan) settingsThemesCountSpan.textContent = settings.selectedThemes?.length || 0;
    if (settingsThemesTotalSpan) settingsThemesTotalSpan.textContent = settings.availableThemes?.length || 0;

    // Populate Answer Types Checkboxes
    if (settingsAnswerTypesListDiv && settings.availableAnswerTypes) {
        settingsAnswerTypesListDiv.innerHTML = settings.availableAnswerTypes.map(type => {
            const isChecked = settings.selectedAnswerTypes?.includes(type); // Add safety check
            const checkboxId = `type-${type.replace(/[^a-zA-Z0-9]/g, '-')}`;
            return `<label for="${checkboxId}" class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input type="checkbox" id="${checkboxId}" value="${sanitizeHTML(type)}" ${isChecked ? 'checked' : ''} class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300">
                        <span>${sanitizeHTML(type)}</span>
                    </label>`;
        }).join('');
    }
    if (settingsTypesCountSpan) settingsTypesCountSpan.textContent = settings.selectedAnswerTypes?.length || 0;
    if (settingsTypesTotalSpan) settingsTypesTotalSpan.textContent = settings.availableAnswerTypes?.length || 0;

    if (settingsAvailableQuestionsSpan) settingsAvailableQuestionsSpan.textContent = state.filteredQuestionCount ?? '?';

    // Disable inputs if not host
    const isSettingsDisabled = !isHost;
    [settingsMaxPlayersSelect, settingsGameModeSelect, settingsTargetScoreInput, applySettingsButton, ...selectAllButtons, ...deselectAllButtons].forEach(el => { if (el) el.disabled = isSettingsDisabled; });

    if (settingsThemesListDiv) settingsThemesListDiv.querySelectorAll('input').forEach(inp => inp.disabled = isSettingsDisabled);
    if (settingsAnswerTypesListDiv) settingsAnswerTypesListDiv.querySelectorAll('input').forEach(inp => inp.disabled = isSettingsDisabled);

    const controlsToStyle = settingsView ? settingsView.querySelectorAll('select, input, button') : [];
    if (isSettingsDisabled) {
        controlsToStyle.forEach(el => el.classList.add('opacity-70', 'cursor-not-allowed'));
    } else {
        controlsToStyle.forEach(el => el.classList.remove('opacity-70', 'cursor-not-allowed'));
        // Re-enable AI select only if LLM available and host
        if (settingsAiModeSelect) {
            settingsAiModeSelect.disabled = !settings.llmAvailable;
             if (!settings.llmAvailable) {
                 settingsAiModeSelect.classList.add('opacity-70', 'cursor-not-allowed');
             }
        }
    }
}

// Updates the Gameplay View elements
function updateGameplayView(state) {
    const question = state.currentQuestion;
    const me = state.players?.find(p => p.id === myPlayerId); // Safety check state.players

    // Display Previous Round Results
    if (previousRoundResultsDisplay && previousRoundResultsPre) {
        if (lastRoundResultsMessage) {
            previousRoundResultsPre.textContent = lastRoundResultsMessage;
            previousRoundResultsDisplay.classList.remove('hidden');
        } else {
            previousRoundResultsDisplay.classList.add('hidden');
        }
    }

    // Scores
    if (playerScoresDiv && state.players) {
        playerScoresDiv.textContent = 'Scores: ' + state.players
            .map(p => `${sanitizeHTML(p.name)}: ${p.score}`)
            .join(' | ');
    }

    // Question details
    if (question && questionNumberH3 && questionThemeSpan && questionSubthemeSpan && questionTextP) {
        questionNumberH3.textContent = `Question ${state.questionHistoryCount || '?'}`;
        questionThemeSpan.textContent = sanitizeHTML(question['Тема'] || '?');
        questionSubthemeSpan.textContent = sanitizeHTML(question['Подтема'] || 'N/A');
        questionTextP.textContent = sanitizeHTML(question['Вопрос'] || 'Loading question...');
    } else if (questionTextP) {
        questionTextP.textContent = 'Waiting for question...';
    }

    // Answer Input
    if (answerInput && submitAnswerButton && answerFeedbackP) {
        const canAnswer = me && !me.hasAnsweredThisRound && state.phase === 'playing';
        answerInput.disabled = !canAnswer;
        submitAnswerButton.disabled = !canAnswer;
        if (canAnswer) {
            answerInput.focus();
            answerFeedbackP.textContent = 'Enter your answer!';
            answerInput.classList.remove('bg-gray-100');
        } else if (me?.hasAnsweredThisRound) {
            answerFeedbackP.textContent = 'Your answer is submitted. Waiting for others...';
            answerInput.classList.add('bg-gray-100');
        } else {
             answerFeedbackP.textContent = 'Waiting for question or round to start...';
             answerInput.classList.add('bg-gray-100');
        }
    }

     // Show submitted status for all players
     if (submittedAnswersList && state.players) {
        submittedAnswersList.innerHTML = '';
        state.players.forEach(p => {
            const li = document.createElement('li');
            li.className = p.hasAnsweredThisRound ? 'text-green-600' : 'text-gray-400 italic';
            li.textContent = `${sanitizeHTML(p.name)}: ${p.hasAnsweredThisRound ? 'Submitted ✅' : 'Waiting...'}`;
            submittedAnswersList.appendChild(li);
        });
    }
    if(submittedAnswersDiv) submittedAnswersDiv.style.display = 'block';
}

// Updates the Round End View elements
function updateRoundEndView(state) {
    if (roundResultsPre) { // Check if element exists
        if (state.roundResults) {
            roundResultsPre.textContent = sanitizeHTML(state.roundResults.message);
            lastRoundResultsMessage = state.roundResults.message; // Store for display next round
        } else {
            roundResultsPre.textContent = 'Calculating results...';
            lastRoundResultsMessage = "Calculating results...";
        }
    }
}

// Updates the Game Over View elements
function updateGameOverView(state) {
    if (state.gameOverData && gameOverReasonP && finalScoresList) {
        gameOverReasonP.textContent = sanitizeHTML(state.gameOverData.reason);
        finalScoresList.innerHTML = Object.entries(state.gameOverData.scores)
            .map(([name, score]) => `<li class="font-medium">${sanitizeHTML(name)}: ${score}</li>`)
            .join('');
    }
    if (playAgainButton) {
        playAgainButton.disabled = !isHost && state.players?.length > 0; // Safety check players
        playAgainButton.title = !isHost && state.players?.length > 0 ? "Waiting for host to restart" : "Start a new game";
    }
}


// --- Socket Event Handlers ---
currentGameState = { players: [] }; // Initialize safely

socket.on('connect', () => {
    if(connectionStatusSpan) {
        connectionStatusSpan.textContent = 'Connected';
        connectionStatusSpan.style.color = 'green';
    }
    myPlayerId = socket.id;
    console.log('Connected to server with ID:', myPlayerId);
    if (joinButton) joinButton.textContent = 'Create Lobby'; // Default text
});

socket.on('disconnect', () => {
    if(connectionStatusSpan) {
        connectionStatusSpan.textContent = 'Disconnected';
        connectionStatusSpan.style.color = 'red';
    }
    showView('join-view');
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
        alert(`Error: ${message}`); // Fallback alert
    }

    // Reset button states on error if needed
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

  // --- Clear answer input logic ---
  const newQuestionNum = newState.currentQuestion ? newState.currentQuestion['№'] : null;
  if (newState.phase === 'playing' && oldQuestionNum !== newQuestionNum && answerInput) {
      answerInput.value = '';
      if (oldPhase !== 'playing' && oldPhase !== 'round_end') {
           lastRoundResultsMessage = null;
      }
  }
  if (newState.phase === 'lobby' && oldPhase !== 'lobby') {
      lastRoundResultsMessage = null;
  }

  // --- View Logic ---
  const playerIsInGame = newState.players?.some(p => p.id === myPlayerId);

  // 1. Always update the Join View's status panel elements
  updateJoinView(newState);

  // 2. Control Lobby View visibility
  if (lobbyView) {
      if (playerIsInGame && newState.phase === 'lobby') {
          lobbyView.style.display = 'block'; // Show lobby view below
          updateLobbyView(newState);
      } else {
          lobbyView.style.display = 'none'; // Hide lobby view
      }
  }

  // 3. Handle main view transitions
  switch (newState.phase) {
      case 'lobby':
        if (!playerIsInGame) {
            showView('join-view');
            if(lobbyView) lobbyView.style.display = 'none';
            // Ensure correct initial left panel state when not joined
            if(lobbyStatusWrapper) lobbyStatusWrapper.style.display = 'block';
            if(opponentInfoPanel) opponentInfoPanel.style.display = 'none';
        } else {
            // Player IS joined and in lobby phase:
            if (joinView) joinView.style.display = ''; // Keep join view visible using CSS display

            // --- Left Panel Logic ---
            let opponent = null;
            if (newState.players && newState.players.length > 1) {
                opponent = newState.players.find(p => p.id !== myPlayerId);
            }

            if (opponent && lobbyStatusWrapper && opponentInfoPanel) {
                // Opponent found: Show opponent info, hide status
                lobbyStatusWrapper.style.display = 'none';
                opponentInfoPanel.style.display = 'flex'; // Use flex to center items
                updateOpponentInfoPanel(opponent); // Populate with opponent data
            } else if (lobbyStatusWrapper && opponentInfoPanel) {
                // No opponent (player is alone): Show status, hide opponent info
                lobbyStatusWrapper.style.display = 'block';
                opponentInfoPanel.style.display = 'none';
                // updateJoinView already called above takes care of updating status wrapper content
            }
            // --- End Left Panel Logic ---

            // Hide other main views explicitly
            if (settingsView) settingsView.style.display = 'none';
            if (gameplayView) gameplayView.style.display = 'none';
            if (roundEndView) roundEndView.style.display = 'none';
            if (gameOverView) gameOverView.style.display = 'none';
        }
      break;
      case 'settings':
           // Only host should see settings, others stay in lobby layout
           if (isHost) {
               showView('settings-view'); // Hides join and lobby implicitly
               updateSettingsView(newState);
           } else if (playerIsInGame) {
               // Non-host stays in lobby layout: Ensure join + lobby visible
               if (joinView) joinView.style.display = ''; // Restore class display
               if (lobbyView) lobbyView.style.display = 'block'; // Ensure lobby visible
               updateLobbyView(newState);
               updateJoinView(newState);
               // Hide others
               if (settingsView) settingsView.style.display = 'none';
               if (gameplayView) gameplayView.style.display = 'none';
               if (roundEndView) roundEndView.style.display = 'none';
               if (gameOverView) gameOverView.style.display = 'none';
           } else {
               showView('join-view'); // Fallback to join if not in game
           }
           break;
      case 'playing':
          showView('gameplay-view'); // Hides join and lobby views implicitly
          updateGameplayView(newState);
          break;
       case 'round_end':
           showView('round-end-view'); // Hides join and lobby views implicitly
           updateRoundEndView(newState);
          break;
      case 'game_over':
          showView('game-over-view'); // Hides join and lobby views implicitly
          updateGameOverView(newState);
          break;
      default:
          showView('join-view');
          updateJoinView(newState);
          if(lobbyView) lobbyView.style.display = 'none';
  }

  // 4. Update Join Button state, style, text, and Name Input
  if (joinButton) {
    if (playerIsInGame) {
        // --- Player IS IN LOBBY ---
        joinButton.textContent = 'Leave Lobby 🚪'; // Add emoji
        joinButton.disabled = false;
        // Remove blue styles, add red styles
        joinButton.classList.remove('bg-gradient-to-r', 'from-blue-600', 'to-blue-500', 'hover:from-blue-700', 'hover:to-blue-600');
        joinButton.classList.add('bg-red-600', 'hover:bg-red-700');
        if (nameInput) nameInput.disabled = true;
    } else {
        // --- Player IS NOT IN LOBBY ---
        joinButton.textContent = newState.players?.length === 0 ? 'Create Lobby' : 'Join Game'; // No emoji
        joinButton.disabled = false;
        // Remove red styles, add blue styles back
        joinButton.classList.remove('bg-red-600', 'hover:bg-red-700');
        joinButton.classList.add('bg-gradient-to-r', 'from-blue-600', 'to-blue-500', 'hover:from-blue-700', 'hover:to-blue-600');
        if (nameInput) nameInput.disabled = false;
    }
  }
});


//=================================================================================
//                             --- Event Listeners ---
//=================================================================================

if (joinButton) {
  joinButton.addEventListener('click', () => {
      // Check if the player is currently considered 'in the game' by the client state
      const playerIsInGame = currentGameState.players?.some(p => p.id === myPlayerId);

      if (playerIsInGame) {
          // --- Player IS in the game, so this button acts as "Leave Lobby" ---
          console.log('Main action button clicked while joined - emitting leaveLobby');
          socket.emit('leaveLobby');
          // Optionally disable button temporarily while leaving
          joinButton.disabled = true;
          joinButton.textContent = 'Leaving... 🚪'; // Updated temporary text
          // UI update will happen via updateState from server
      } else {
          // --- Player IS NOT in the game, so this button acts as "Join/Create" ---
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
              // Let updateState handle re-enabling the button on success/failure
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
            // Don't just show view, emit request to server or handle state change properly
            // For now, just show view client-side if host clicks
            showView('settings-view');
            updateSettingsView(currentGameState);
         }
    });
}

if (cancelSettingsButton) {
    cancelSettingsButton.addEventListener('click', () => {
        if (settingsError) settingsError.textContent = '';
        // Go back based on state - assuming player is joined and in lobby phase
        if (joinView) joinView.style.display = 'block';
        if (lobbyView) lobbyView.style.display = 'block';
        if (settingsView) settingsView.style.display = 'none';
        updateLobbyView(currentGameState); // Refresh lobby
    });
}

if (applySettingsButton) {
    applySettingsButton.addEventListener('click', () => {
        if (!isHost) return;
        if (settingsError) settingsError.textContent = '';

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

        // Go back to lobby view state visually
        if (joinView) joinView.style.display = 'block';
        if (lobbyView) lobbyView.style.display = 'block';
        if (settingsView) settingsView.style.display = 'none';
        // updateLobbyView will be called via updateState event
    });
}

// Select/Deselect All Checkboxes
selectAllButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetListId = button.getAttribute('data-target');
        if (targetListId) {
            document.querySelectorAll(`#${targetListId} input[type="checkbox"]`).forEach(checkbox => checkbox.checked = true);
            // Optionally trigger count update here if needed immediately
        }
    });
});

deselectAllButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetListId = button.getAttribute('data-target');
         if (targetListId) {
            document.querySelectorAll(`#${targetListId} input[type="checkbox"]`).forEach(checkbox => checkbox.checked = false);
            // Optionally trigger count update here
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
    // --- Load from localStorage ---
    const savedName = getLocalStorage('playerName');
    const savedAvatarOptions = getLocalStorage('playerAvatar');

    if (savedName && nameInput) {
        nameInput.value = savedName;
    }

    // Function to generate and display the avatar in the main preview
    function generateAndDisplayAvatar(forceRandom = false) {
        // Check if avatar.js loaded Avataaars and getRandomAvatarOptions
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
            // Use stored options unless forced random or none exist yet
            if (forceRandom || !currentAvatarOptions) {
                currentAvatarOptions = getRandomAvatarOptions(); // Get new random options
            }
            // Now use whatever is in currentAvatarOptions
            const svgString = Avataaars.create(currentAvatarOptions); // Use global Avataaars
            avatarContainer.innerHTML = svgString;
        } catch (error) {
            console.error("Error generating avatar:", error);
            avatarContainer.innerHTML = '<p class="text-red-500 text-center text-xs p-4">Error loading avatar</p>';
        }
    }


    // Initial setup
    if (savedAvatarOptions) {
        currentAvatarOptions = savedAvatarOptions; // Use saved options first
    } else {
        generateAndDisplayAvatar(true); // Generate random if nothing saved
    }
    generateAndDisplayAvatar(false); // Display initial avatar (saved or newly random)


    // Randomize button listener
    if (randomizeAvatarButton) {
        randomizeAvatarButton.addEventListener('click', () => {
            generateAndDisplayAvatar(true); // Pass true to force random generation
        });
    }

    showView('join-view'); // Start at the join view
    // No need to call updateJoinView here, wait for first 'updateState' from server
});


// --- Local Storage Helpers ---
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


function updateOpponentInfoPanel(opponent) {
  if (!opponent || !opponentInfoPanel) return; // Exit if no opponent or panel

  if (opponentInfoAvatar && opponent.avatarOptions && typeof Avataaars !== 'undefined') {
      try {
          // Adjust size as needed
          const opponentAvatarOptions = { ...opponent.avatarOptions, width: '128px', height: '128px' };
          opponentInfoAvatar.innerHTML = Avataaars.create(opponentAvatarOptions);
      } catch (e) {
          console.error("Error rendering opponent avatar", e);
          if(opponentInfoAvatar) opponentInfoAvatar.innerHTML = '?'; // Fallback
      }
  } else if (opponentInfoAvatar) {
       opponentInfoAvatar.innerHTML = '?'; // Fallback if no avatar data
  }

  if (opponentInfoName) opponentInfoName.textContent = opponent.name || 'Opponent';
  // Access the persistent stats added by the modified getSanitizedGameState
  if (opponentInfoGames) opponentInfoGames.textContent = opponent.gamesPlayed !== undefined ? opponent.gamesPlayed : '?';
  if (opponentInfoScore) opponentInfoScore.textContent = opponent.totalScore !== undefined ? opponent.totalScore : '?';
  if (opponentInfoWins) opponentInfoWins.textContent = opponent.wins !== undefined ? opponent.wins : '?'; // Added for wins

}