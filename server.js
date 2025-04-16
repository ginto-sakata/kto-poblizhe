require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

// --- Import Custom Modules ---
const dataManager = require('./dataManager');
const gameStateManager = require('./gameStateManager');
const llmService = require('./llmservice');
const gameController = require('./gameController');
const socketHandlers = require('./socketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
     // Optional: Configure transports, ping intervals etc.
     // transports: ['websocket', 'polling'],
     // pingInterval: 10000,
     // pingTimeout: 5000,
});

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Initialization Sequence ---
async function initializeServer() {
    try {
        console.log("Initializing server...");

        // 1. Load data
        await dataManager.loadQuestions();
        dataManager.loadPlayers(); // Load player data cache

        // 2. Initialize LLM Service (needs API Key)
        const llmReady = llmService.initializeLlm(GEMINI_API_KEY);
        if (!llmReady) {
            console.warn("LLM Service failed to initialize or is unavailable.");
        }

        // 3. Initialize Game State (needs question data available)
        gameStateManager.initializeGameState();

        // 4. Initialize Game Controller (needs IO)
        gameController.initialize(io);

        // 5. Initialize Socket Handlers (needs IO)
        socketHandlers.initialize(io); // This attaches the 'connection' listener

        console.log("Server initialization complete.");

        // 6. Start Listening
        server.listen(PORT, () => {
            console.log(`Server listening on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("FATAL: Failed to initialize server.", error);
        process.exit(1);
    }
}

// --- Server Setup ---
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files

// --- Start Initialization ---
initializeServer();

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
    console.log('\nServer shutting down...');
    dataManager.savePlayers(); // Save players data on exit
    console.log('Player data saved.');
    io.close(() => { // Close Socket.IO connections
         console.log('Socket.IO connections closed.');
         server.close(() => { // Close HTTP server
             console.log('Server closed.');
             process.exit(0);
         });
    });

    // Force close after timeout if server hangs
     setTimeout(() => {
        console.error('Force closing server after timeout.');
        process.exit(1);
    }, 5000);
});

// Optional: Handle other shutdown signals
process.on('SIGTERM', () => {
     console.log('SIGTERM signal received: closing server gracefully');
     // Trigger the same shutdown logic as SIGINT
     process.kill(process.pid, 'SIGINT');
});

process.on('uncaughtException', (err, origin) => {
  console.error(`Uncaught Exception: ${err.message}`);
  console.error(`Origin: ${origin}`);
  console.error(err.stack);
  // Optionally try to save data before exiting, but it might be unstable
  // dataManager.savePlayers();
  process.exit(1); // Exit after uncaught exception
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
   // Optionally try to save data before exiting
   // dataManager.savePlayers();
  process.exit(1); // Exit after unhandled rejection
});