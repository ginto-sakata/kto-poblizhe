// socketHandlers.js
const gameStateManager = require('./gameStateManager');
const gameController = require('./gameController');
const dataManager = require('./dataManager'); // Needed for player data on disconnect potentially
const llmService = require('./llmservice'); // Needed for isLLMAvailable

let io; // To be set by initialize

function initialize(socketIoInstance) {
    io = socketIoInstance;
    if (!io) {
        console.error("FATAL: Socket.IO instance not provided to socketHandlers.initialize");
        process.exit(1);
    }
    io.on('connection', setupSocketEvents);
    console.log("Socket handlers initialized.");
}

function setupSocketEvents(socket) {
    console.log(`User connected: ${socket.id}`);

    // Send initial state to the connecting client
    const initialState = gameStateManager.getSanitizedGameState(socket.id, llmService.isLLMAvailable());
    if (initialState) {
        socket.emit('updateState', initialState);
    } else {
        socket.emit('gameError', 'Failed to get initial game state.');
        console.error("Failed to send initial state, gameState might be null.");
    }

    // --- Event Listeners ---

    socket.on('joinGame', (playerJoinData) => {
        if (!playerJoinData || typeof playerJoinData !== 'object') { socket.emit('joinError', 'Invalid join data format.'); return; }
        const { name, avatarOptions } = playerJoinData;
        if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 20) { socket.emit('joinError', 'Invalid name provided.'); return; }
        if (!avatarOptions || typeof avatarOptions !== 'object') { socket.emit('joinError', 'Invalid avatar data provided.'); return; }

        const result = gameStateManager.addPlayer(socket.id, name, avatarOptions);

        if (result.success) {
             // Join a room specific to this game instance (using hostId as a simple unique identifier for now)
             // TODO: Implement a better Game ID system if supporting multiple concurrent games
             const gameState = gameStateManager.getGameState();
             const gameRoomId = gameState.hostId || 'default_game_room'; // Use host ID or a default
             socket.join(gameRoomId);
             console.log(`Socket ${socket.id} joined room ${gameRoomId}`);
            gameController.broadcastGameState();
        } else {
            socket.emit('joinError', result.error);
        }
    });

    socket.on('startGame', () => {
        gameController.startGame(socket.id);
    });

    socket.on('submitAnswer', (answer) => {
        gameController.handleAnswer(socket.id, answer);
    });

    socket.on('changeSettings', (newSettings) => {
        if (typeof newSettings !== 'object' || newSettings === null) { socket.emit('gameError', 'Invalid settings format.'); return; }
        const result = gameStateManager.handleChangeSettings(socket.id, newSettings, llmService.isLLMAvailable());
        if (result.error) { socket.emit('gameError', result.error); }
        if (result.warning) { console.warn(`Settings Warning for ${socket.id}: ${result.warning}`); /* Maybe emit warning? */ }
        if (result.settingsChanged) { gameController.broadcastGameState(); }
    });

    socket.on('requestReset', () => {
        gameController.requestResetHandler(socket.id);
    });

    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.id}. Reason: ${reason}`);
        const { playerExisted, gameShouldEnd } = gameStateManager.removePlayer(socket.id);

        if (playerExisted) {
            if (gameShouldEnd) {
                gameController.endGame("Not enough players left.");
            } else {
                gameController.broadcastGameState(); // Update remaining players
            }
        }
         // Leave the game room explicitly? (Might happen automatically)
         // const gameState = gameStateManager.getGameState();
         // const gameRoomId = gameState?.hostId || 'default_game_room';
         // socket.leave(gameRoomId);
         // console.log(`Socket ${socket.id} left room ${gameRoomId}`);
    });

    socket.on('error', (error) => {
      console.error(`Socket Error from ${socket.id}:`, error);
      // socket.emit('gameError', 'An unexpected socket error occurred.');
    });
}

module.exports = {
    initialize
};