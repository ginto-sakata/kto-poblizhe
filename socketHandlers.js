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

        const initialPlayerCount = Object.keys(gameStateManager.getGameState()?.players || {}).length;
        const result = gameStateManager.addPlayer(socket.id, name, avatarOptions);

        if (result.success) {
            const gameState = gameStateManager.getGameState();
            const gameRoomId = gameState.hostId || 'default_game_room'; // Room is usually based on host
            socket.join(gameRoomId);
            console.log(`Socket ${socket.id} (${name}) joined room ${gameRoomId}`);

            // --- MODIFIED BROADCAST LOGIC ---
            // Check if the lobby was just created by this join action
            const wasLobbyJustCreated = initialPlayerCount === 0 && Object.keys(gameState.players).length === 1;

            if (wasLobbyJustCreated) {
                console.log(`Broadcasting initial lobby creation to ALL sockets.`);
                // Send sanitized state individually to ALL connected sockets
                io.sockets.sockets.forEach(connectedSocket => {
                    // Get the state sanitized specifically for the recipient socket
                    const stateToSend = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                    if (stateToSend) {
                        connectedSocket.emit('updateState', stateToSend);
                    }
                });

            } else {
                // Existing lobby, broadcast normally (to the room/relevant players)
                console.log(`Broadcasting lobby update within room ${gameRoomId}.`);
                gameController.broadcastGameState(); // Assumes this targets the correct players already
            }
            // --- END MODIFIED BROADCAST LOGIC ---

       } else {
           socket.emit('joinError', result.error || 'Failed to join.'); // Send specific error
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


            const updatedGameState = gameStateManager.getGameState(); // Get state *after* removal
            const isLobbyNowEmpty = !updatedGameState.hostId && Object.keys(updatedGameState.players).length === 0;

            if (gameShouldEnd) {
                 // This case handles ending mid-game, which is less likely here, but keep it.
                 // Should probably also broadcast globally if it empties the lobby.
                 gameController.endGame("Not enough players left.");
                 // Add global broadcast here too if endGame doesn't handle it
                 console.log(`Broadcasting final empty state to ALL sockets after game ended.`);
                 io.sockets.sockets.forEach(connectedSocket => {
                     const finalState = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                     if (finalState) connectedSocket.emit('updateState', finalState);
                 });
            } else if (isLobbyNowEmpty) {
                // Last player left the lobby, game state was reset. Broadcast empty state to everyone.
                console.log(`Broadcasting reset empty state to ALL sockets.`);
                io.sockets.sockets.forEach(connectedSocket => {
                    const finalState = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                    if (finalState) connectedSocket.emit('updateState', finalState);
                });
                // The leaving player is included in the io.sockets loop, so they get the update too.
            }
             else {
                 // Lobby still exists, broadcast normally to remaining players.
                 console.log(`Broadcasting updated lobby state after player ${socket.id} left.`);
                 gameController.broadcastGameState(); // Assumes this targets correctly
                 // Also send state specifically to the leaving player so their UI resets.
                 const stateForLeavingPlayer = gameStateManager.getSanitizedGameState(socket.id, llmService.isLLMAvailable());
                 if (stateForLeavingPlayer) {
                    socket.emit('updateState', stateForLeavingPlayer);
                 }
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
            const updatedGameState = gameStateManager.getGameState(); // Get state *after* removal
            const isLobbyNowEmpty = !updatedGameState.hostId && Object.keys(updatedGameState.players).length === 0;
    
            if (gameShouldEnd) {
                 // Game ended mid-play due to disconnect
                 gameController.endGame("Not enough players left after disconnect.");
                 // Broadcast the final state globally
                 console.log(`Broadcasting final empty state to ALL sockets after disconnect ended game.`);
                 io.sockets.sockets.forEach(connectedSocket => {
                    const finalState = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                    if (finalState) connectedSocket.emit('updateState', finalState);
                 });
            } else if (isLobbyNowEmpty) {
                // Last player disconnected from lobby, game state was reset. Broadcast empty state to everyone.
                console.log(`Broadcasting reset empty state to ALL sockets after last player disconnected.`);
                 io.sockets.sockets.forEach(connectedSocket => {
                    const finalState = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                    if (finalState) connectedSocket.emit('updateState', finalState);
                 });
            }
            else {
                // Lobby/game still exists, broadcast normally to remaining players.
                console.log(`Broadcasting updated game state after player ${socket.id} disconnected.`);
                gameController.broadcastGameState(); // Assumes this targets correctly
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