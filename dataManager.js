// dataManager.js

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const QUESTIONS_FILE = path.join(__dirname, 'data', 'game.csv');

let questions = [];
let playersDB = {};

//============================= Question Loading =============================
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

//============================= Get Questions =============================
function getQuestions() {
    return questions;
}

//============================= Get Available Themes And Types =============================
function getAvailableThemesAndTypes() {
    if (!questions || questions.length === 0) return { themes: [], answerTypes: [] };
    const validQuestions = questions.filter(q => q['Тема'] && q['Тип ответа']);
    const themes = [...new Set(validQuestions.map(q => q['Тема']))].sort();
    const answerTypes = [...new Set(validQuestions.map(q => q['Тип ответа']))].sort();
    return { themes, answerTypes };
}

//============================= Player Data Loading =============================
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
            savePlayers();
        }
    } catch (error) {
        console.error("Error loading or parsing players.json:", error);
        playersDB = {};
    }
}

//============================= Player Data Saving =============================
function savePlayers() {
    try {
        const dataDir = path.dirname(PLAYERS_FILE);
        if (!fs.existsSync(dataDir)){
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify(playersDB, null, 2), 'utf8');
    } catch (error) {
        console.error("Error saving players.json:", error);
    }
}

//============================= Get Player Data =============================
function getPlayerData(playerId, playerName, avatarOptions = null) {
    if (!playersDB[playerId]) {
        playersDB[playerId] = {
            name: playerName,
            avatarOptions: avatarOptions,
            totalScore: 0,
            gamesPlayed: 0,
            wins: 0,
            answerStats: {}
        };
        console.log(`Created new DB entry for player: ${playerName} (${playerId})`);
    } else {
        let updated = false;
        if (playersDB[playerId].name !== playerName) {
             console.log(`Updating name for player ${playerId} from ${playersDB[playerId].name} to ${playerName}`);
             playersDB[playerId].name = playerName;
             updated = true;
        }
        if (avatarOptions && JSON.stringify(playersDB[playerId].avatarOptions) !== JSON.stringify(avatarOptions)) {
            console.log(`Updating avatar for player ${playerId}`);
            playersDB[playerId].avatarOptions = avatarOptions;
            updated = true;
        }
    }
    return playersDB[playerId];
}

//============================= Update Player Stat In Memory =============================
function updatePlayerStatInMemory(playerId, statKey, value, increment = true) {
    if (!playersDB[playerId]) {
        console.warn(`Attempted to update stat '${statKey}' for non-existent player ID ${playerId} in DB cache.`);
        return;
    }
    if (statKey === 'answerStats') {
         const scoreValue = String(value);
         playersDB[playerId].answerStats[scoreValue] = (playersDB[playerId].answerStats[scoreValue] || 0) + 1;
    } else if (increment) {
        playersDB[playerId][statKey] = (playersDB[playerId][statKey] || 0) + value;
    } else {
        playersDB[playerId][statKey] = value;
    }
}

//============================= Get Leaderboard =============================
function getLeaderboard(limit = 5) {
     return Object.entries(playersDB)
        .map(([id, data]) => ({
             id,
             name: data.name || `ID_${id.substring(0,4)}`,
             score: data.totalScore || 0,
             wins: data.wins || 0,
         }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

//============================= Get All Players Data =============================
function getAllPlayersData() {
    return playersDB;
}


module.exports = {
    loadQuestions,
    getQuestions,
    getAvailableThemesAndTypes,
    loadPlayers,
    savePlayers,
    getPlayerData,
    updatePlayerStatInMemory,
    getLeaderboard,
    getAllPlayersData
};