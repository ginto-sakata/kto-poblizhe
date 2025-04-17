// gameStateManager.js

const dataManager = require('./dataManager');
let gameState = null;

//============================= Create Initial Game State =============================
function createInitialGameState() {
    const { themes, answerTypes } = dataManager.getAvailableThemesAndTypes();
    const initialState = {
        phase: 'lobby',
        players: {},
        maxPlayers: 2,
        hostId: null,
        currentQuestion: null,
        questionHistory: [],
        settings: {
            gameMode: 'score',
            targetScore: 10,
            timeLimit: 300,
            useAi: 'auto',
            llmModel: 'gemini-2.0-flash',
            availableThemes: themes,
            selectedThemes: [...themes],
            availableAnswerTypes: answerTypes,
            selectedAnswerTypes: [...answerTypes],
        },
        roundResults: null,
        gameOverData: null,
        filteredQuestionCount: 0,
    };
    updateFilteredQuestions(initialState);
    return initialState;
}

//============================= Initialize Game State =============================
function initializeGameState() {
    gameState = createInitialGameState();
    console.log("Initial game state created.");
}

//============================= Get Game State =============================
function getGameState() {
    return gameState;
}

//============================= Reset Game =============================
function resetGame() {
    const oldHostId = gameState?.hostId;
    gameState = createInitialGameState();
    console.log("Game reset to initial state (keeping filters/settings).");

    if (oldHostId) {
        const playersData = dataManager.getAllPlayersData();
        const hostData = playersData[oldHostId];
        if (hostData) {
            console.log(`Re-adding previous host: ${hostData.name}`);
            addPlayer(oldHostId, hostData.name, hostData.avatarOptions, true);
        } else {
            console.warn(`Could not find player data for previous host ${oldHostId} during reset.`);
        }
    }
}

//============================= Update Filtered Questions =============================
function updateFilteredQuestions(state = gameState) {
    if (!state) return;
    const questions = dataManager.getQuestions();
    if (!questions || questions.length === 0) {
        state.filteredQuestionCount = 0;
        return;
    }

    const validSelectedThemes = state.settings.selectedThemes.filter(t => state.settings.availableThemes.includes(t));
    const validSelectedAnswerTypes = state.settings.selectedAnswerTypes.filter(t => state.settings.availableAnswerTypes.includes(t));
    state.settings.selectedThemes = validSelectedThemes;
    state.settings.selectedAnswerTypes = validSelectedAnswerTypes;

    let count = 0;
    for (const q of questions) {
        if (validSelectedThemes.includes(q['Тема']) &&
            validSelectedAnswerTypes.includes(q['Тип ответа'])) {
            count++;
        }
    }
    state.filteredQuestionCount = count;
}

//============================= Add Player =============================
function addPlayer(socketId, name, avatarOptions, forceHost = false) {
    if (!gameState) return { success: false, error: 'Game state not initialized.' };
    if (gameState.phase !== 'lobby') return { success: false, error: 'Cannot join game in progress.' };
    if (!forceHost && Object.keys(gameState.players).length >= gameState.maxPlayers) return { success: false, error: 'Lobby is full.' };

    const cleanName = (name || '').trim().substring(0, 20) || `Player_${socketId.substring(0, 4)}`;

    if (!forceHost && Object.values(gameState.players).some(p => p.name === cleanName)) {
        return { success: false, error: `Name "${cleanName}" is already taken.` };
    }

    dataManager.getPlayerData(socketId, cleanName, avatarOptions);

    const isHost = forceHost || !gameState.hostId;

    gameState.players[socketId] = {
        id: socketId,
        name: cleanName,
        avatarOptions: avatarOptions,
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

//============================= Remove Player =============================
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
         gameShouldEnd = true;
         console.log("Ending game: Not enough players left after disconnect.");
    } else if (numRemainingPlayers === 0 && (gameState.phase === 'lobby' || gameState.phase === 'game_over')) {
        console.log("Last player left lobby/game over screen. Resetting game.");
        resetGame();
    }

    return { playerExisted: true, hostChanged, gameShouldEnd };
}

//============================= Handle Change Settings =============================
function handleChangeSettings(playerId, newSettings, isLLMAvailable) {
    if (!gameState) return { success: false, error: 'Game state not initialized.' };
    if (playerId !== gameState.hostId) return { success: false, error: 'Only the host can change settings.' };
    if (gameState.phase !== 'lobby') return { success: false, error: 'Settings can only be changed in the lobby.' };

    console.log("Host settings change received:", newSettings);
    let settingsChanged = false;
    let filtersChanged = false;
    let errorMsg = null;
    let warningMsg = null;

    //======================== --- Apply Max Players ---
    if (newSettings.maxPlayers !== undefined) {
        const mp = parseInt(newSettings.maxPlayers, 10);
        const currentPlayersCount = Object.keys(gameState.players).length;
        if (!isNaN(mp) && mp >= 1 && mp <= 10) {
            if (mp < currentPlayersCount) {
                errorMsg = `Max players (${mp}) cannot be less than current players (${currentPlayersCount}).`;
            } else if (gameState.maxPlayers !== mp) {
                gameState.maxPlayers = mp;
                settingsChanged = true;
                console.log(`Max players set to ${mp}`);
            }
        } else {
             console.warn("Invalid maxPlayers value received:", newSettings.maxPlayers);
        }
    }

    //======================== --- Apply Game Mode & Target Score ---
    if (newSettings.gameMode === 'score') {
        if (gameState.settings.gameMode !== 'score') {
            gameState.settings.gameMode = 'score';
            settingsChanged = true;
        }
        if (newSettings.targetScore !== undefined) {
            const ts = parseInt(newSettings.targetScore, 10);
            if (!isNaN(ts) && ts >= 1 && ts <= 100) {
                if (gameState.settings.targetScore !== ts) {
                    gameState.settings.targetScore = ts;
                    settingsChanged = true;
                    console.log(`Target score set to ${ts}`);
                }
            } else {
                 console.warn("Invalid targetScore value received:", newSettings.targetScore);
            }
        }
    }

    //======================== --- Apply AI Usage ---
    const allowedAiModes = ['no_ai', 'auto', 'ai_always'];
    if (newSettings.useAi && allowedAiModes.includes(newSettings.useAi)) {
        const requestedAi = newSettings.useAi;
        let finalAi = requestedAi;

        if (!isLLMAvailable && requestedAi !== 'no_ai') {
            finalAi = 'no_ai';
            if (gameState.settings.useAi !== 'no_ai') {
                warningMsg = "LLM is not available on the server. AI mode set to 'No AI'.";
            }
        }

        if (gameState.settings.useAi !== finalAi) {
            gameState.settings.useAi = finalAi;
            settingsChanged = true;
            console.log(`AI usage set to ${finalAi}`);
        }
    }

    //======================== --- Apply Filters (Themes) ---
    if (newSettings.selectedThemes && Array.isArray(newSettings.selectedThemes)) {
        const valid = newSettings.selectedThemes.filter(t => gameState.settings.availableThemes.includes(t));
        if (JSON.stringify(gameState.settings.selectedThemes.slice().sort()) !== JSON.stringify(valid.slice().sort())) {
            gameState.settings.selectedThemes = valid;
            filtersChanged = true;
        }
    }

    //======================== --- Apply Filters (Answer Types) ---
    if (newSettings.selectedAnswerTypes && Array.isArray(newSettings.selectedAnswerTypes)) {
        const valid = newSettings.selectedAnswerTypes.filter(t => gameState.settings.availableAnswerTypes.includes(t));
        if (JSON.stringify(gameState.settings.selectedAnswerTypes.slice().sort()) !== JSON.stringify(valid.slice().sort())) {
            gameState.settings.selectedAnswerTypes = valid;
            filtersChanged = true;
        }
    }

    //======================== --- Update Question Count ---
    if (filtersChanged) {
        updateFilteredQuestions();
        settingsChanged = true;
        console.log(`Filters updated. New question count: ${gameState.filteredQuestionCount}`);
        if (gameState.filteredQuestionCount === 0) {
            warningMsg = (warningMsg ? warningMsg + " " : "") + "Warning: No questions match the selected filters.";
        }
    }

    return { success: !errorMsg, settingsChanged, error: errorMsg, warning: warningMsg };
}

//============================= Get Sanitized Game State =============================
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

    //======================== --- Enrich Player Data ---
    stateToSend.players = Object.values(stateToSend.players).map(player => {
        const persistentData = dataManager.getPlayerData(player.id, player.name, player.avatarOptions);
        return {
            ...player,
            totalScore: persistentData.totalScore || 0,
            gamesPlayed: persistentData.gamesPlayed || 0,
            wins: persistentData.wins || 0,
        };
    });

    //======================== --- Redact Sensitive Info ---
    stateToSend.questionHistoryCount = gameState.questionHistory?.length || 0;
    delete stateToSend.questionHistory;

    if (stateToSend.phase === 'playing' && stateToSend.currentQuestion) {
        stateToSend.currentQuestion = { ...stateToSend.currentQuestion };
        delete stateToSend.currentQuestion['Ответ'];
    }

    //======================== --- Add Client-Specific Data ---
    stateToSend.myId = playerId;
    stateToSend.isHost = playerId === gameState.hostId;
    stateToSend.leaderboard = dataManager.getLeaderboard();
    stateToSend.settings.llmAvailable = isLLMAvailable;
    stateToSend.filteredQuestionCount = gameState.filteredQuestionCount;

    //======================== --- Adjust AI mode if LLM is unavailable ---
    if (!isLLMAvailable) {
        stateToSend.settings.useAi = 'no_ai';
    }

    return stateToSend;
}


module.exports = {
    initializeGameState,
    getGameState,
    resetGame,
    addPlayer,
    removePlayer,
    handleChangeSettings,
    getSanitizedGameState,
    updateFilteredQuestions
};