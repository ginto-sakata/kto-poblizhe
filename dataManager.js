const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const QUESTIONS_FILE = path.join(__dirname, 'data', 'game.csv');

let questions = [];
let playersDB = {}; // In-memory cache for players.json

// --- Question Loading ---
function loadQuestions() {
    return new Promise((resolve, reject) => {
        const loadedQuestions = [];
        if (!fs.existsSync(QUESTIONS_FILE)) {
             console.error(`Error: Questions file not found at ${QUESTIONS_FILE}`);
             reject(new Error(`Questions file not found at ${QUESTIONS_FILE}`));
             return;
         }
        fs.createReadStream(QUESTIONS_FILE)
            .pipe(csv())
            .on('data', (row) => {
                row.AI = parseInt(row.AI, 10) || 0;
                row['№'] = row['№'] || `generated_${loadedQuestions.length}`;
                row['Тема'] = row['Тема'] || 'Unknown';
                row['Вопрос'] = row['Вопрос'] || 'Missing Question Text';
                row['Ответ'] = row['Ответ'] || 'Missing Answer';
                row['Тип ответа'] = row['Тип ответа'] || 'Unknown';
                loadedQuestions.push(row);
            })
            .on('end', () => {
                console.log(`Loaded ${loadedQuestions.length} questions from ${QUESTIONS_FILE}.`);
                questions = loadedQuestions;
                resolve();
            })
            .on('error', (error) => {
                console.error(`Error loading questions from ${QUESTIONS_FILE}:`, error);
                reject(error);
            });
    });
}

function getQuestions() {
    return questions;
}

function getAvailableThemesAndTypes() {
    if (!questions || questions.length === 0) return { themes: [], answerTypes: [] };
    const validQuestions = questions.filter(q => q['Тема'] && q['Тип ответа']);
    const themes = [...new Set(validQuestions.map(q => q['Тема']))].sort();
    const answerTypes = [...new Set(validQuestions.map(q => q['Тип ответа']))].sort();
    return { themes, answerTypes };
}


// --- Player Data (players.json) ---
function loadPlayers() {
    try {
        const dataDir = path.dirname(PLAYERS_FILE);
         if (!fs.existsSync(dataDir)){
            fs.mkdirSync(dataDir, { recursive: true });
            console.log(`Created data directory at ${dataDir}`);
        }

        if (fs.existsSync(PLAYERS_FILE)) {
            const data = fs.readFileSync(PLAYERS_FILE, 'utf8');
            if (!data || data.trim() === '') {
                playersDB = {};
                console.log("players.json was empty, starting fresh.");
            } else {
                playersDB = JSON.parse(data);
                console.log("Loaded player database (players.json).");
            }
        } else {
            playersDB = {};
            console.log("players.json not found, starting fresh.");
            savePlayers(); // Attempt to create the file
        }
    } catch (error) {
        console.error("Error loading or parsing players.json:", error);
        playersDB = {}; // Start with empty if loading fails
    }
}

function savePlayers() {
    try {
        // Ensure directory exists (important for first save)
        const dataDir = path.dirname(PLAYERS_FILE);
        if (!fs.existsSync(dataDir)){
            fs.mkdirSync(dataDir, { recursive: true });
        }
        // Save the current state of playersDB cache
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify(playersDB, null, 2), 'utf8'); // Pretty print
        // console.log('Player database (players.json) saved.'); // Less noisy logging
    } catch (error) {
        console.error("Error saving players.json:", error);
    }
}

// Gets player data from cache, creating if necessary (but doesn't save immediately)
function getPlayerData(playerId, playerName, avatarOptions = null) {
    if (!playersDB[playerId]) {
        playersDB[playerId] = {
            name: playerName,
            avatarOptions: avatarOptions, // Store initial avatar
            totalScore: 0,
            gamesPlayed: 0,
            wins: 0,
            answerStats: {} // { scoreValue: count }
        };
        console.log(`Created new DB entry for player: ${playerName} (${playerId})`);
        // Don't save here, save only on game end
    } else {
        // Update name/avatar if they changed
        let updated = false;
        if (playersDB[playerId].name !== playerName) {
             console.log(`Updating name for player ${playerId} from ${playersDB[playerId].name} to ${playerName}`);
             playersDB[playerId].name = playerName;
             updated = true;
        }
        // Only update avatar if a new one is explicitly provided (avoids overwriting with null)
        if (avatarOptions && JSON.stringify(playersDB[playerId].avatarOptions) !== JSON.stringify(avatarOptions)) {
            console.log(`Updating avatar for player ${playerId}`);
            playersDB[playerId].avatarOptions = avatarOptions;
            updated = true;
        }
        // Don't save here
    }
    return playersDB[playerId];
}

// Updates a specific stat for a player IN THE CACHE (doesn't save file)
function updatePlayerStatInMemory(playerId, statKey, value, increment = true) {
    if (!playersDB[playerId]) {
        console.warn(`Attempted to update stat '${statKey}' for non-existent player ID ${playerId} in DB cache.`);
        return; // Or create the player entry first? Depends on desired behavior.
    }
    if (statKey === 'answerStats') {
         // Special handling for answerStats object
         const scoreValue = String(value); // The key is the score (e.g., "0", "2", "3")
         playersDB[playerId].answerStats[scoreValue] = (playersDB[playerId].answerStats[scoreValue] || 0) + 1;
    } else if (increment) {
        playersDB[playerId][statKey] = (playersDB[playerId][statKey] || 0) + value;
    } else {
        playersDB[playerId][statKey] = value;
    }
    // No save here
}

function getLeaderboard(limit = 5) {
     return Object.entries(playersDB)
        .map(([id, data]) => ({
             id, // Keep id if needed elsewhere
             name: data.name || `ID_${id.substring(0,4)}`, // Use stored name
             score: data.totalScore || 0,
             wins: data.wins || 0,
             // avatarOptions: data.avatarOptions // Optionally include avatar for leaderboard display
         }))
        .sort((a, b) => b.score - a.score) // Sort by total score
        .slice(0, limit);
}

function getAllPlayersData() {
    return playersDB; // Return the cache
}


module.exports = {
    loadQuestions,
    getQuestions,
    getAvailableThemesAndTypes,
    loadPlayers,
    savePlayers, // Export save for server exit
    getPlayerData,
    updatePlayerStatInMemory,
    getLeaderboard,
    getAllPlayersData
};