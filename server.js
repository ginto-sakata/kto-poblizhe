// server.js

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

//============================= Import Custom Modules =============================
const dataManager = require('./dataManager');
const gameStateManager = require('./gameStateManager');
const llmService = require('./llmservice');
const gameController = require('./gameController');
const socketHandlers = require('./socketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {});

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

//============================= Initialization Sequence =============================
async function initializeServer() {
    try {
        console.log("Initializing server...");

        await dataManager.loadQuestions();
        dataManager.loadPlayers();

        const llmReady = llmService.initializeLlm(GEMINI_API_KEY);
        if (!llmReady) {
            console.warn("LLM Service failed to initialize or is unavailable.");
        }

        gameStateManager.initializeGameState();
        gameController.initialize(io);
        socketHandlers.initialize(io);

        console.log("Server initialization complete.");

        server.listen(PORT, () => {
            console.log(`Server listening on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("FATAL: Failed to initialize server.", error);
        process.exit(1);
    }
}

//============================= Server Setup =============================
app.use(express.static(path.join(__dirname, 'public')));

//============================= Start Initialization =============================
initializeServer();

//============================= Graceful Shutdown =============================
process.on('SIGINT', () => {
    console.log('\nServer shutting down...');
    dataManager.savePlayers();
    console.log('Player data saved.');
    io.close(() => {
         console.log('Socket.IO connections closed.');
         server.close(() => {
             console.log('Server closed.');
             process.exit(0);
         });
    });

     setTimeout(() => {
        console.error('Force closing server after timeout.');
        process.exit(1);
    }, 5000);
});

//======================== --- Handle SIGTERM ---
process.on('SIGTERM', () => {
     console.log('SIGTERM signal received: closing server gracefully');
     process.kill(process.pid, 'SIGINT');
});

//======================== --- Handle Uncaught Exceptions ---
process.on('uncaughtException', (err, origin) => {
  console.error(`Uncaught Exception: ${err.message}`);
  console.error(`Origin: ${origin}`);
  console.error(err.stack);
  process.exit(1);
});

//======================== --- Handle Unhandled Rejections ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});