// gameStateManager.js

const dataManager = require('./dataManager');
let gameState = null; // Will be initialized by server.js

function createInitialGameState() {
    const { themes, answerTypes } = dataManager.getAvailableThemesAndTypes();
    const initialState = {
        phase: 'lobby',
        players: {}, // { socketId: { id, name, score, avatarOptions, answer, hasAnswered } }
        maxPlayers: 4, // Default max players
        hostId: null,
        currentQuestion: null,
        questionHistory: [], // Array of question '№' values
        settings: {
            gameMode: 'score',
            targetScore: 10,
            timeLimit: 300, // Keep for potential future use
            useAi: 'never', // Default AI setting
            llmModel: 'gemini-2.0-flash-lite',
            availableThemes: themes,
            selectedThemes: [...themes], // Default to all
            availableAnswerTypes: answerTypes,
            selectedAnswerTypes: [...answerTypes], // Default to all
        },
        roundResults: null,
        gameOverData: null,
        filteredQuestionCount: 0, // Will be updated by updateFilteredQuestions
    };
    updateFilteredQuestions(initialState); // Calculate initial count
    return initialState;
}

function initializeGameState() {
    gameState = createInitialGameState();
    console.log("Initial game state created.");
}

function getGameState() {
    return gameState;
}

function resetGame() {
    const oldHostId = gameState?.hostId; // Preserve host if possible
    gameState = createInitialGameState();
    console.log("Game reset to initial state (keeping filters/settings).");

    // If there was a host, try to re-add them (needs player data)
    if (oldHostId) {
        const playersData = dataManager.getAllPlayersData();
        const hostData = playersData[oldHostId];
        if (hostData) {
            console.log(`Re-adding previous host: ${hostData.name}`);
            addPlayer(oldHostId, hostData.name, hostData.avatarOptions, true); // Re-add as host
        } else {
            console.warn(`Could not find player data for previous host ${oldHostId} during reset.`);
        }
    }
}


function updateFilteredQuestions(state = gameState) {
    if (!state) return;
    const questions = dataManager.getQuestions();
    if (!questions || questions.length === 0) {
        state.filteredQuestionCount = 0;
        return;
    }

    // Ensure selections are valid against current available options
    const validSelectedThemes = state.settings.selectedThemes.filter(t => state.settings.availableThemes.includes(t));
    const validSelectedAnswerTypes = state.settings.selectedAnswerTypes.filter(t => state.settings.availableAnswerTypes.includes(t));
    state.settings.selectedThemes = validSelectedThemes; // Correct the state if needed
    state.settings.selectedAnswerTypes = validSelectedAnswerTypes;

    let count = 0;
    for (const q of questions) {
        if (validSelectedThemes.includes(q['Тема']) &&
            validSelectedAnswerTypes.includes(q['Тип ответа'])) {
            count++;
        }
    }
    state.filteredQuestionCount = count;
    // console.log(`Filtered question count updated: ${state.filteredQuestionCount}`); // Less noisy
}

// Adds player to the IN-MEMORY gameState
function addPlayer(socketId, name, avatarOptions, forceHost = false) {
    if (!gameState) return { success: false, error: 'Game state not initialized.' };
    if (gameState.phase !== 'lobby') return { success: false, error: 'Cannot join game in progress.' };
    if (!forceHost && Object.keys(gameState.players).length >= gameState.maxPlayers) return { success: false, error: 'Lobby is full.' };

    const cleanName = (name || '').trim().substring(0, 20) || `Player_${socketId.substring(0, 4)}`;

    // Check for duplicate names only if not resetting the host
    if (!forceHost && Object.values(gameState.players).some(p => p.name === cleanName)) {
        return { success: false, error: `Name "${cleanName}" is already taken.` };
    }

    // Ensure player has an entry in the persistent DB cache (updates name/avatar if needed)
    dataManager.getPlayerData(socketId, cleanName, avatarOptions);

    const isHost = forceHost || !gameState.hostId; // First player becomes host or if forced

    gameState.players[socketId] = {
        id: socketId,
        name: cleanName,
        avatarOptions: avatarOptions, // Store avatar options
        score: 0,
        answer: null,
        hasAnsweredThisRound: false
    };

    if (isHost) {
        gameState.hostId = socketId;
        console.log(`Player ${cleanName} (${socketId}) joined as HOST.`);
    } else {
        console.log(`Player ${cleanName} (${socketId}) joined.`);
    }

    return { success: true };
}

// Removes player from the IN-MEMORY gameState
function removePlayer(socketId) {
    if (!gameState || !gameState.players[socketId]) {
        return { playerExisted: false };
    }

    const playerName = gameState.players[socketId].name;
    const wasHost = gameState.hostId === socketId;
    delete gameState.players[socketId];
    console.log(`Player ${playerName} (${socketId}) removed from game state.`);

    const remainingPlayerIds = Object.keys(gameState.players);
    const numRemainingPlayers = remainingPlayerIds.length;
    let hostChanged = false;
    let gameShouldEnd = false;

    if (wasHost) {
        gameState.hostId = numRemainingPlayers > 0 ? remainingPlayerIds[0] : null;
        hostChanged = true;
        console.log(`Host left. New host: ${gameState.hostId ? gameState.players[gameState.hostId]?.name : 'None'}`);
    }

    if (gameState.phase !== 'lobby' && gameState.phase !== 'game_over' && numRemainingPlayers < 1) {
         // Game ends if < 1 player remains during active play/round end
         gameShouldEnd = true;
         console.log("Ending game: Not enough players left after disconnect.");
    } else if (numRemainingPlayers === 0 && (gameState.phase === 'lobby' || gameState.phase === 'game_over')) {
        // If lobby/game over becomes empty, reset fully
        console.log("Last player left lobby/game over screen. Resetting game.");
        resetGame(); // Full reset, clears settings too potentially
        // Host might be re-added by resetGame if data exists
    }


    return { playerExisted: true, hostChanged, gameShouldEnd };
}

// Modifies the IN-MEMORY gameState settings
function handleChangeSettings(playerId, newSettings, isLLMAvailable) {
    if (!gameState) return { success: false, error: 'Game state not initialized.' };
    if (playerId !== gameState.hostId) return { success: false, error: 'Only the host can change settings.' };
    if (gameState.phase !== 'lobby') return { success: false, error: 'Settings can only be changed in the lobby.' };

    console.log("Host settings change received:", newSettings);
    let settingsChanged = false;
    let filtersChanged = false;
    let errorMsg = null;
    let warningMsg = null;

    // Apply Max Players
    if (newSettings.maxPlayers !== undefined) {
        const mp = parseInt(newSettings.maxPlayers, 10);
        const currentPlayersCount = Object.keys(gameState.players).length;
        if (!isNaN(mp) && mp >= 1 && mp <= 10) { // Adjust max limit as needed
            if (mp < currentPlayersCount) {
                errorMsg = `Max players (${mp}) cannot be less than current players (${currentPlayersCount}).`;
            } else if (gameState.maxPlayers !== mp) {
                gameState.maxPlayers = mp;
                settingsChanged = true;
                console.log(`Max players set to ${mp}`);
            }
        } else {
             // Optionally send error for invalid number range
             console.warn("Invalid maxPlayers value received:", newSettings.maxPlayers);
        }
    }

    // Apply Game Mode & Target Score (Only 'score' mode for now)
    if (newSettings.gameMode === 'score') {
        if (gameState.settings.gameMode !== 'score') {
            gameState.settings.gameMode = 'score';
            settingsChanged = true;
        }
        if (newSettings.targetScore !== undefined) {
            const ts = parseInt(newSettings.targetScore, 10);
            if (!isNaN(ts) && ts >= 1 && ts <= 100) { // Adjust target score limits
                if (gameState.settings.targetScore !== ts) {
                    gameState.settings.targetScore = ts;
                    settingsChanged = true;
                    console.log(`Target score set to ${ts}`);
                }
            } else {
                 console.warn("Invalid targetScore value received:", newSettings.targetScore);
            }
        }
    } // Add other game modes (e.g., 'time') here later if needed

    // Apply AI Usage
    if (newSettings.useAi && ['never', 'text_only', 'always'].includes(newSettings.useAi)) {
        const requestedAi = newSettings.useAi;
        let finalAi = requestedAi;

        if (!isLLMAvailable && requestedAi !== 'never') {
            finalAi = 'never'; // Force 'never' if LLM is unavailable server-side
            if (gameState.settings.useAi !== 'never') {
                warningMsg = "LLM is not available on the server. AI usage set to 'Never'.";
            }
        }

        if (gameState.settings.useAi !== finalAi) {
            gameState.settings.useAi = finalAi;
            settingsChanged = true;
            console.log(`AI usage set to ${finalAi}`);
        }
    }

    // Apply Filters (Themes)
    if (newSettings.selectedThemes && Array.isArray(newSettings.selectedThemes)) {
        // Filter against currently available themes to prevent invalid selections
        const valid = newSettings.selectedThemes.filter(t => gameState.settings.availableThemes.includes(t));
        // Check if the sorted arrays are different to see if a change occurred
        if (JSON.stringify(gameState.settings.selectedThemes.slice().sort()) !== JSON.stringify(valid.slice().sort())) {
            gameState.settings.selectedThemes = valid;
            filtersChanged = true;
        }
    }

    // Apply Filters (Answer Types)
    if (newSettings.selectedAnswerTypes && Array.isArray(newSettings.selectedAnswerTypes)) {
        const valid = newSettings.selectedAnswerTypes.filter(t => gameState.settings.availableAnswerTypes.includes(t));
        if (JSON.stringify(gameState.settings.selectedAnswerTypes.slice().sort()) !== JSON.stringify(valid.slice().sort())) {
            gameState.settings.selectedAnswerTypes = valid;
            filtersChanged = true;
        }
    }

    // Update filtered question count if filters changed
    if (filtersChanged) {
        updateFilteredQuestions(); // Update count based on new filters
        settingsChanged = true; // Mark general settings as changed
        console.log(`Filters updated. New question count: ${gameState.filteredQuestionCount}`);
        if (gameState.filteredQuestionCount === 0) {
            warningMsg = (warningMsg ? warningMsg + " " : "") + "Warning: No questions match the selected filters.";
        }
    }

    return { success: !errorMsg, settingsChanged, error: errorMsg, warning: warningMsg };
}

function getSanitizedGameState(playerId, isLLMAvailable) {
    if (!gameState) return null;

    let stateToSend;
    try {
        stateToSend = typeof structuredClone === 'function'
            ? structuredClone(gameState)
            : JSON.parse(JSON.stringify(gameState));
    } catch (e) {
        console.error("Error cloning game state:", e);
        return null;
    }

    // Convert players object to array and enrich with persistent stats
    stateToSend.players = Object.values(stateToSend.players).map(player => {
        const persistentData = dataManager.getPlayerData(player.id, player.name, player.avatarOptions);
        return {
            ...player, // Current game data (id, name, score, avatar, answer, hasAnswered)
            totalScore: persistentData.totalScore || 0,
            gamesPlayed: persistentData.gamesPlayed || 0,
            wins: persistentData.wins || 0,
        };
    });

    // Redact question history details
    stateToSend.questionHistoryCount = gameState.questionHistory?.length || 0;
    delete stateToSend.questionHistory;

    // Redact correct answer during play
    if (stateToSend.phase === 'playing' && stateToSend.currentQuestion) {
        stateToSend.currentQuestion = { ...stateToSend.currentQuestion };
        delete stateToSend.currentQuestion['Ответ'];
    }

    // Add client-specific flags and derived data
    stateToSend.myId = playerId;
    stateToSend.isHost = playerId === gameState.hostId;
    stateToSend.leaderboard = dataManager.getLeaderboard();
    stateToSend.settings.llmAvailable = isLLMAvailable;
    stateToSend.filteredQuestionCount = gameState.filteredQuestionCount;

    // Adjust AI setting based on server availability
    if (!isLLMAvailable) {
        stateToSend.settings.useAi = 'never';
    }

    return stateToSend;
}


module.exports = {
    initializeGameState,
    getGameState, // Allow reading the state
    resetGame,
    addPlayer,
    removePlayer,
    handleChangeSettings,
    getSanitizedGameState,
    updateFilteredQuestions // Export if needed externally (e.g., on initial load)
};