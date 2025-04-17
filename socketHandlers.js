// socketHandlers.js
const gameStateManager = require('./gameStateManager');
const gameController = require('./gameController');
const dataManager = require('./dataManager');
const llmService = require('./llmservice');

let io;

//============================= Initialize Socket Handlers =============================
function initialize(socketIoInstance) {
    io = socketIoInstance;
    if (!io) {
        console.error("FATAL: Socket.IO instance not provided to socketHandlers.initialize");
        process.exit(1);
    }
    io.on('connection', setupSocketEvents);
    console.log("Socket handlers initialized.");
}

//============================= Setup Socket Events =============================
function setupSocketEvents(socket) {
    console.log(`User connected: ${socket.id}`);

    //======================== --- Send Initial State ---
    const initialState = gameStateManager.getSanitizedGameState(socket.id, llmService.isLLMAvailable());
    if (initialState) {
        socket.emit('updateState', initialState);
    } else {
        socket.emit('gameError', 'Failed to get initial game state.');
        console.error("Failed to send initial state, gameState might be null.");
    }

    //======================== --- Event Listener: joinGame ---
    socket.on('joinGame', (playerJoinData) => {
        if (!playerJoinData || typeof playerJoinData !== 'object') { socket.emit('joinError', 'Invalid join data format.'); return; }
        const { name, avatarOptions } = playerJoinData;
        if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 20) { socket.emit('joinError', 'Invalid name provided.'); return; }
        if (!avatarOptions || typeof avatarOptions !== 'object') { socket.emit('joinError', 'Invalid avatar data provided.'); return; }

        const initialPlayerCount = Object.keys(gameStateManager.getGameState()?.players || {}).length;
        const result = gameStateManager.addPlayer(socket.id, name, avatarOptions);

        if (result.success) {
            const gameState = gameStateManager.getGameState();
            const gameRoomId = gameState.hostId || 'default_game_room';
            socket.join(gameRoomId);
            console.log(`Socket ${socket.id} (${name}) joined room ${gameRoomId}`);

            //======================== --- Broadcast Logic on Join ---
            const wasLobbyJustCreated = initialPlayerCount === 0 && Object.keys(gameState.players).length === 1;

            if (wasLobbyJustCreated) {
                console.log(`Broadcasting initial lobby creation to ALL sockets.`);
                io.sockets.sockets.forEach(connectedSocket => {
                    const stateToSend = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                    if (stateToSend) {
                        connectedSocket.emit('updateState', stateToSend);
                    }
                });

            } else {
                console.log(`Broadcasting lobby update within room ${gameRoomId}.`);
                gameController.broadcastGameState();
            }
            //======================== --- End Broadcast Logic ---

       } else {
           socket.emit('joinError', result.error || 'Failed to join.');
       }
    });

    //======================== --- Event Listener: leaveLobby ---
    socket.on('leaveLobby', () => {
        console.log(`Received leaveLobby request from ${socket.id}`);
        const { playerExisted, gameShouldEnd } = gameStateManager.removePlayer(socket.id);

        if (playerExisted) {
            console.log(`Player ${socket.id} successfully processed for leaving.`);
            const gameState = gameStateManager.getGameState();
            const gameRoomId = gameState?.hostId || 'default_game_room';
            if (socket.rooms.has(gameRoomId)) {
                 socket.leave(gameRoomId);
                 console.log(`Socket ${socket.id} left room ${gameRoomId}`);
            } else {
                console.warn(`Socket ${socket.id} was not in room ${gameRoomId} to leave.`);
            }

            const updatedGameState = gameStateManager.getGameState();
            const isLobbyNowEmpty = !updatedGameState.hostId && Object.keys(updatedGameState.players).length === 0;

            if (gameShouldEnd) {
                 gameController.endGame("Not enough players left.");
                 console.log(`Broadcasting final empty state to ALL sockets after game ended.`);
                 io.sockets.sockets.forEach(connectedSocket => {
                     const finalState = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                     if (finalState) connectedSocket.emit('updateState', finalState);
                 });
            } else if (isLobbyNowEmpty) {
                console.log(`Broadcasting reset empty state to ALL sockets.`);
                io.sockets.sockets.forEach(connectedSocket => {
                    const finalState = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                    if (finalState) connectedSocket.emit('updateState', finalState);
                });
            }
             else {
                 console.log(`Broadcasting updated lobby state after player ${socket.id} left.`);
                 gameController.broadcastGameState();
                 const stateForLeavingPlayer = gameStateManager.getSanitizedGameState(socket.id, llmService.isLLMAvailable());
                 if (stateForLeavingPlayer) {
                    socket.emit('updateState', stateForLeavingPlayer);
                 }
             }

        } else {
            console.log(`Player ${socket.id} tried to leave, but was not found in the game state.`);
            const stateForLeavingPlayer = gameStateManager.getSanitizedGameState(socket.id, llmService.isLLMAvailable());
             if (stateForLeavingPlayer) {
                socket.emit('updateState', stateForLeavingPlayer);
             }
        }
    });

    //======================== --- Event Listener: startGame ---
    socket.on('startGame', () => {
        gameController.startGame(socket.id);
    });

    //======================== --- Event Listener: submitAnswer ---
    socket.on('submitAnswer', (answer) => {
        gameController.handleAnswer(socket.id, answer);
    });

    //======================== --- Event Listener: changeSettings ---
    socket.on('changeSettings', (newSettings) => {
        if (typeof newSettings !== 'object' || newSettings === null) { socket.emit('gameError', 'Invalid settings format.'); return; }
        const result = gameStateManager.handleChangeSettings(socket.id, newSettings, llmService.isLLMAvailable());
        if (result.error) { socket.emit('gameError', result.error); }
        if (result.warning) { console.warn(`Settings Warning for ${socket.id}: ${result.warning}`); }
        if (result.settingsChanged) { gameController.broadcastGameState(); }
    });

    //======================== --- Event Listener: requestReset ---
    socket.on('requestReset', () => {
        gameController.requestResetHandler(socket.id);
    });

    //======================== --- Event Listener: disconnect ---
    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.id}. Reason: ${reason}`);
        const { playerExisted, gameShouldEnd } = gameStateManager.removePlayer(socket.id);

        if (playerExisted) {
            const updatedGameState = gameStateManager.getGameState();
            const isLobbyNowEmpty = !updatedGameState.hostId && Object.keys(updatedGameState.players).length === 0;

            if (gameShouldEnd) {
                 gameController.endGame("Not enough players left after disconnect.");
                 console.log(`Broadcasting final empty state to ALL sockets after disconnect ended game.`);
                 io.sockets.sockets.forEach(connectedSocket => {
                    const finalState = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                    if (finalState) connectedSocket.emit('updateState', finalState);
                 });
            } else if (isLobbyNowEmpty) {
                console.log(`Broadcasting reset empty state to ALL sockets after last player disconnected.`);
                 io.sockets.sockets.forEach(connectedSocket => {
                    const finalState = gameStateManager.getSanitizedGameState(connectedSocket.id, llmService.isLLMAvailable());
                    if (finalState) connectedSocket.emit('updateState', finalState);
                 });
            }
            else {
                console.log(`Broadcasting updated game state after player ${socket.id} disconnected.`);
                gameController.broadcastGameState();
            }
        }
    });

    //======================== --- Event Listener: error ---
    socket.on('error', (error) => {
      console.error(`Socket Error from ${socket.id}:`, error);
    });
}

module.exports = {
    initialize
};