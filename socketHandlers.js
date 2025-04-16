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

    socket.on('leaveLobby', () => {
        console.log(`Received leaveLobby request from ${socket.id}`);
        // Use the existing removePlayer function which handles state update and host transfer
        const { playerExisted, gameShouldEnd } = gameStateManager.removePlayer(socket.id);

        if (playerExisted) {
            console.log(`Player ${socket.id} successfully processed for leaving.`);
            // Leave the socket room associated with the game/lobby
            // Note: Finding the correct room ID might need adjustment if you have multiple lobbies
            const gameState = gameStateManager.getGameState(); // Get state *after* removal attempt
            const gameRoomId = gameState?.hostId || 'default_game_room'; // Use *new* host ID or default
            // Check if the socket is actually in the room before trying to leave
            if (socket.rooms.has(gameRoomId)) {
                 socket.leave(gameRoomId);
                 console.log(`Socket ${socket.id} left room ${gameRoomId}`);
            } else {
                // It might have already left if host changed and broadcast happened before leave msg processed?
                // Or if using a different room ID logic.
                console.warn(`Socket ${socket.id} was not in room ${gameRoomId} to leave.`);
            }


            if (gameShouldEnd) {
                 // removePlayer determined the game should end (e.g., last player left mid-game)
                 gameController.endGame("Not enough players left.");
            } else {
                 // Broadcast the updated state to remaining players (if any)
                 gameController.broadcastGameState();
            }
            // Send an updateState back to the *leaving* player too, so their UI resets correctly
            // They will receive the state where they are no longer in `players` list.
             const stateForLeavingPlayer = gameStateManager.getSanitizedGameState(socket.id, llmService.isLLMAvailable());
             if (stateForLeavingPlayer) {
                socket.emit('updateState', stateForLeavingPlayer);
             }
        } else {
            console.log(`Player ${socket.id} tried to leave, but was not found in the game state.`);
            // Optionally send an error or just update their state which should show them as not joined
            const stateForLeavingPlayer = gameStateManager.getSanitizedGameState(socket.id, llmService.isLLMAvailable());
             if (stateForLeavingPlayer) {
                socket.emit('updateState', stateForLeavingPlayer);
             }
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