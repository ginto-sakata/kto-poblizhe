// gameLogic.js
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Keep this import if using Gemini
const dataManager = require('./dataManager');
const gameStateManager = require('./gameStateManager');

let io; // Will be set by initializeGameLogic
let genAI;
let geminiModel;

// --- Initialization ---
function initializeGameLogic(socketIoInstance, apiKey) {
    io = socketIoInstance;
    // --- Gemini Setup ---
    if (apiKey) {
        try {
            genAI = new GoogleGenerativeAI(apiKey);
            // Use a readily available model, adjust if needed
            geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Using latest flash model
            console.log("Gemini AI Initialized in gameLogic using gemini-1.5-flash-latest.");
        } catch (error) {
            console.error("Failed to initialize Gemini AI:", error.message);
            geminiModel = null;
        }
    } else {
        console.warn("GEMINI_API_KEY not found. LLM features will be disabled.");
        geminiModel = null;
    }
}

function isLLMAvailable() {
    return !!geminiModel;
}

// --- Communication ---
function broadcastGameState() {
    const gameState = gameStateManager.getGameState();
    if (!gameState) {
        console.error("broadcastGameState called before gameState is initialized.");
        return;
    }
    // Send updated state to all connected players in the game
    Object.keys(gameState.players).forEach(id => {
        const socket = io?.sockets?.sockets?.get(id); // Added safety checks for io and sockets
        if (socket) {
            const sanitizedState = gameStateManager.getSanitizedGameState(id, isLLMAvailable());
            if (sanitizedState) {
                socket.emit('updateState', sanitizedState);
            } else {
                 console.error(`Failed to get sanitized game state for player ${id}`);
            }
        } else {
             // console.warn(`Socket not found for player ID ${id} during broadcast.`); // Optional warning
        }
    });
    // Add spectator broadcast here if needed
}

// --- Game Flow ---
function startGame(playerId) {
    const gameState = gameStateManager.getGameState();
    if (!gameState) { io?.to(playerId)?.emit('gameError', 'Game not ready.'); return; } // Safety check

    if (playerId !== gameState.hostId) {
        io?.to(playerId)?.emit('gameError', 'Only the host can start the game.');
        return;
    }
    if (Object.keys(gameState.players).length < 1) { // Use 1 for testing, maybe 2 for real game
        io?.to(playerId)?.emit('gameError', 'At least 1 player is needed to start.');
        return;
    }

    gameStateManager.updateFilteredQuestions(); // Ensure count is correct before checking
    if (gameState.filteredQuestionCount === 0) {
        io?.to(playerId)?.emit('gameError', 'No questions match the current filter settings.');
        return;
    }

    console.log(`Game started by host ${playerId}`);
    gameState.phase = 'playing';
    gameState.questionHistory = [];
    gameState.roundResults = null; // Clear any previous results
    gameState.gameOverData = null; // Clear game over data

    Object.values(gameState.players).forEach(p => {
        p.score = 0;
        p.answer = null;
        p.hasAnsweredThisRound = false;
        p.lastScore = null;
        // Update games_played in the DB cache (will be saved on game end)
        dataManager.updatePlayerStatInMemory(p.id, 'gamesPlayed', 1);
    });

    nextRound(); // Start the first round
}

function nextRound() {
    const gameState = gameStateManager.getGameState();
    if (!gameState || gameState.phase === 'game_over') { // Don't start new round if game ended
         console.log("nextRound called but game state invalid or game over.");
         return;
    }

    // Reset round-specific player state
    Object.values(gameState.players).forEach(p => {
        p.answer = null;
        p.hasAnsweredThisRound = false;
        p.lastScore = null; // Reset last round's score
    });
    gameState.roundResults = null; // Clear previous round results display data
    gameState.currentQuestion = null; // Clear previous question

    // Find available unique questions matching filters
    gameStateManager.updateFilteredQuestions(); // Ensure count is accurate
    const questions = dataManager.getQuestions();
    const history = gameState.questionHistory;
    const currentThemes = gameState.settings.selectedThemes;
    const currentTypes = gameState.settings.selectedAnswerTypes;

    // Check if questions array exists and has content
     if (!questions || questions.length === 0) {
        console.error("No questions loaded or available.");
        endGame("Error: No questions available to play.");
        return;
     }

    const uniqueAvailableQuestions = questions.filter(q =>
        q && q['№'] && q['Тема'] && q['Тип ответа'] && // Basic question validity check
        !history.includes(q['№']) &&
        currentThemes.includes(q['Тема']) &&
        currentTypes.includes(q['Тип ответа'])
    );

    if (uniqueAvailableQuestions.length === 0) {
        if (gameState.filteredQuestionCount > 0) {
            console.log("No unique questions left matching filters.");
            endGame("Ran out of unique questions for these settings!");
        } else {
            console.log("No questions match the selected filters.");
            endGame("No questions match the selected filters.");
        }
        return;
    }

    // Select and set the next question
    const randomIndex = Math.floor(Math.random() * uniqueAvailableQuestions.length);
    gameState.currentQuestion = uniqueAvailableQuestions[randomIndex];
    gameState.questionHistory.push(gameState.currentQuestion['№']);

    console.log(`Starting Round ${gameState.questionHistory.length}. Q[${gameState.currentQuestion['№']}]: ${gameState.currentQuestion['Вопрос']}`);
    gameState.phase = 'playing';
    broadcastGameState();
    // Add round timer logic here if needed (e.g., setTimeout to force evaluation)
}

function handleAnswer(playerId, answer) {
    const gameState = gameStateManager.getGameState();
    if (!gameState) return;
    if (gameState.phase !== 'playing') { io?.to(playerId)?.emit('gameError', 'Answers are not being accepted right now.'); return; }
    if (!gameState.currentQuestion) { io?.to(playerId)?.emit('gameError', 'There is no active question.'); return; }

    const player = gameState.players[playerId];
    if (!player) { console.warn(`Answer received from non-existent player ID: ${playerId}`); return; }
    if (player.hasAnsweredThisRound) { io?.to(playerId)?.emit('gameError', 'You have already submitted an answer for this round.'); return; }

    const submittedAnswer = String(answer || '').trim().slice(0, 200); // Sanitize and limit length
    if (!submittedAnswer) { io?.to(playerId)?.emit('gameError', 'Your answer cannot be empty.'); return; }

    console.log(`Player ${player.name} (ID: ${playerId}) answered: ${submittedAnswer}`);
    player.answer = submittedAnswer;
    player.hasAnsweredThisRound = true;

    broadcastGameState(); // Update other players' view (show who has submitted)
    checkRoundCompletion(); // Check if all players have now answered
}

function checkRoundCompletion() {
    const gameState = gameStateManager.getGameState();
    if (!gameState || gameState.phase !== 'playing') return;

    const playersInGame = Object.values(gameState.players);
    if (playersInGame.length === 0) {
        console.log("No players in game during round completion check, ending game.");
        endGame("No players remaining in the game."); // End game if no players
        return;
    }

    const allAnswered = playersInGame.every(p => p.hasAnsweredThisRound);

    if (allAnswered) {
        console.log("All players have answered. Evaluating round.");
        gameState.phase = 'round_end'; // Change phase *before* async evaluation
        broadcastGameState(); // Let clients know evaluation is happening
        evaluateRound(); // Start evaluation (can be async)
    }
    // No else needed - just wait for more answers
}

async function evaluateRound() {
    const gameState = gameStateManager.getGameState();
    if (!gameState || !gameState.currentQuestion) {
        console.error("EvaluateRound called without active question or game state.");
        checkEndGameOrNextRound(); // Try to recover or end game
        return;
    }

    const players = gameState.players;
    if (Object.keys(players).length === 0) {
        console.log("No players in game to evaluate.");
        gameState.roundResults = { scores: {}, message: "Round ended: No players." };
        checkEndGameOrNextRound();
        return;
    }

    const question = gameState.currentQuestion;
    const correctAnswerRaw = question['Ответ'];
    const useLLM = isLLMAvailable() && (
        gameState.settings.useAi === 'always' ||
        (gameState.settings.useAi === 'text_only' && question.AI === 1)
    );

    let roundScores = {}; // { playerId: score }
    let evaluationMessage = "";

    console.log(`Evaluating Round ${gameState.questionHistory.length}, Q[${question['№']}], Correct: "${correctAnswerRaw}", Use LLM: ${useLLM}`);

    try {
        if (useLLM) {
            roundScores = await evaluateWithLLM(question, players); // Ensure this returns validated scores
            evaluationMessage = `Scores evaluated by AI. Correct answer: ${correctAnswerRaw}.`; // Include correct answer
        } else {
            roundScores = evaluateNumerically(correctAnswerRaw, players);
            evaluationMessage = `Correct answer: ${correctAnswerRaw}. `; // Numerical eval message
        }
    } catch (error) {
        console.error(`Error during round evaluation (Q: ${question['№']}):`, error);
        evaluationMessage = "An error occurred during evaluation.";
        Object.keys(players).forEach(id => roundScores[id] = 0); // Assign 0 points on error
    }

    // --- Process Scores and Generate Summary ---
    let roundSummaryLines = [evaluationMessage];
    let bestPlayerNames = [];
    let maxPointsThisRound = 0;

    Object.entries(players).forEach(([playerId, player]) => {
        // Ensure player still exists in case they disconnected during async eval
        if(!player) return;

        const points = roundScores[playerId] ?? 0; // Default to 0 if score missing

        // Update player's game state score
        player.score += points;
        player.lastScore = points; // Store for potential display

        // Update persistent stats in memory (saved only on game end)
        // Ensure player data exists in cache before updating
        dataManager.getPlayerData(playerId, player.name, player.avatarOptions); // Creates if needed
        dataManager.updatePlayerStatInMemory(playerId, 'totalScore', points);
        dataManager.updatePlayerStatInMemory(playerId, 'answerStats', points); // Pass score as 'value'

        // Add player result to summary message
        roundSummaryLines.push(`${player.name}: "${player.answer || '-'}" => ${points} pt (Total: ${player.score})`);

        // Track best player(s) this round
        if (points > maxPointsThisRound) {
            maxPointsThisRound = points;
            bestPlayerNames = [player.name];
        } else if (points === maxPointsThisRound && points > 0 && !bestPlayerNames.includes(player.name)) { // Avoid duplicates
            bestPlayerNames.push(player.name);
        }
    });

    // Add a header line about the round winner(s)
    if (bestPlayerNames.length > 0 && maxPointsThisRound > 0) {
        let winnerMsg = `${bestPlayerNames.join(' & ')} `;
        winnerMsg += (maxPointsThisRound === 3) ? 'exact!' : 'closest!';
        roundSummaryLines.unshift(winnerMsg);
    } else { // Handles maxPointsThisRound === 0 or empty bestPlayerNames
        roundSummaryLines.unshift("No points awarded this round.");
    }

    // Store results in game state for broadcasting
    gameState.roundResults = {
        scores: roundScores, // Keep individual scores if needed by client
        message: roundSummaryLines.join('\n')
    };

    console.log(`Round ${gameState.questionHistory.length} Results:\n${gameState.roundResults.message}`);

    // Move to next phase (check win or start next round)
    checkEndGameOrNextRound();
}

function checkEndGameOrNextRound() {
    const gameState = gameStateManager.getGameState();
    // Make sure gameState exists before proceeding
    if (!gameState) {
        console.error("checkEndGameOrNextRound called, but gameState is null.");
        return;
    }

    let gameOver = false;
    let winner = null;
    let reason = "";
    const playersArray = Object.values(gameState.players);

    // Check if game is already over to prevent loops
    if (gameState.phase === 'game_over') {
        console.log("Game is already over, skipping checkEndGameOrNextRound.");
        return;
    }

    // 1. Check Score Win Condition
    if (gameState.settings.gameMode === 'score' && playersArray.length > 0) {
        const playersReachedScore = playersArray.filter(p => p.score >= gameState.settings.targetScore);
        if (playersReachedScore.length > 0) {
            gameOver = true;
            const sortedWinners = playersReachedScore.sort((a, b) => b.score - a.score);
            const highestScore = sortedWinners[0].score;
            const potentialWinners = sortedWinners.filter(p => p.score === highestScore);

            if (potentialWinners.length === 1) {
                winner = potentialWinners[0];
                reason = `${winner.name} reached ${gameState.settings.targetScore} points!`;
            } else {
                winner = null;
                reason = `Tie! ${potentialWinners.map(p => p.name).join(' & ')} reached ${highestScore} points!`;
            }
        }
    }

    // 2. Check if Out of Unique Questions (Only if game not already over by score)
    if (!gameOver && gameState.phase !== 'lobby') { // Check phase to avoid ending during lobby
         gameStateManager.updateFilteredQuestions(); // Recalculate just in case filters changed mid-game? (usually shouldn't)
         const questions = dataManager.getQuestions();
         const history = gameState.questionHistory || []; // Ensure history is an array
         const currentThemes = gameState.settings.selectedThemes || []; // Ensure arrays
         const currentTypes = gameState.settings.selectedAnswerTypes || [];

         // Check if questions data is available
         if (!questions || questions.length === 0) {
              gameOver = true;
              reason = "Error: Question data is missing or empty.";
              console.error(reason);
         } else {
             const remainingUniqueQuestions = questions.filter(q =>
                 q && q['№'] && q['Тема'] && q['Тип ответа'] && // Basic question validity
                 !history.includes(q['№']) &&
                 currentThemes.includes(q['Тема']) &&
                 currentTypes.includes(q['Тип ответа'])
             ).length;

             if (remainingUniqueQuestions === 0) {
                 gameOver = true;
                 reason = "Ran out of unique questions for the selected filters!";

                 // Determine winner by highest score
                 if (playersArray.length > 0) {
                     const sortedPlayers = playersArray.sort((a, b) => b.score - a.score);
                     const highestScore = sortedPlayers[0].score;

                     if (highestScore <= 0) {
                         winner = null;
                         reason += " No winner.";
                     } else {
                         const potentialWinners = sortedPlayers.filter(p => p.score === highestScore);
                         if (potentialWinners.length === 1) {
                             winner = potentialWinners[0];
                             reason += ` ${winner.name} wins with ${highestScore} points!`;
                         } else {
                             winner = null;
                             reason += ` Tied game at ${highestScore} points: ${potentialWinners.map(p => p.name).join(' & ')}!`;
                         }
                     }
                 } else {
                     winner = null;
                     reason += " No players in game.";
                 }
             }
         }
    }

    // --- Transition ---
    if (gameOver) {
        endGame(reason, winner); // Handles phase change and broadcasting
    } else {
        // Still in round_end phase, broadcast results then schedule next round
        console.log(`Broadcasting round results. Next round in ~6 seconds.`);
        broadcastGameState(); // Ensure client sees round_end results
        setTimeout(() => {
            const currentGameState = gameStateManager.getGameState(); // Get fresh state
            if (currentGameState && currentGameState.phase === 'round_end') { // Check phase *again* before starting next round
                nextRound();
            } else {
                console.log(`Next round aborted, game phase is now ${currentGameState?.phase}.`);
            }
        }, 6000); // Delay before starting next round
    }
}


function endGame(reason, winner = null) {
    const gameState = gameStateManager.getGameState();
    if (!gameState || gameState.phase === 'game_over') {
        console.log("Attempted to end game, but it's already over or state is null.");
        return; // Prevent multiple ends/errors
    }

    gameState.phase = 'game_over';
    console.log(`Game Over: ${reason}`);

    const finalScores = {};
    const playersArray = Object.values(gameState.players);

    playersArray.forEach(p => {
        if (p && p.name) { // Ensure player object and name exist
            finalScores[p.name] = p.score || 0; // Use player's final score
        }
    });

    gameState.gameOverData = {
        // Check winner object exists before accessing name
        winnerName: winner ? winner.name : (playersArray.length > 1 ? "Tie!" : (playersArray.length === 1 ? playersArray[0].name : "N/A")), // Adjusted winner logic
        reason: reason,
        scores: finalScores
    };

    // Update wins stat in memory only if there's a single winner
    if (winner) {
        dataManager.updatePlayerStatInMemory(winner.id, 'wins', 1);
    }

    // --- SAVE ALL PLAYER STATS TO FILE ---
    dataManager.savePlayers(); // Save the entire playersDB cache
    console.log("Player stats saved on game end.");
    // ---

    broadcastGameState(); // Notify clients of game over
}


// --- Evaluation Helpers ---

// *** CORRECTED PLACEMENT FOR evaluateWithLLM ***
async function evaluateWithLLM(question, players) {
    if (!geminiModel) {
        console.warn("LLM not available. Falling back to numerical evaluation.");
        return evaluateNumerically(question['Ответ'], players);
    }

    // Check if players object is valid and has entries
     if (!players || typeof players !== 'object' || Object.keys(players).length === 0) {
         console.log("No players or invalid players object to evaluate with LLM.");
         return {}; // Return empty scores if no players
     }

    const playerAnswersList = Object.values(players)
                                     .filter(p => p && p.id && p.name) // Filter out any potentially invalid player entries
                                     .map(p => `- ${p.name} (ID: ${p.id}): "${p.answer || '(no answer)'}"`);

    if (playerAnswersList.length === 0) {
        console.log("No valid player answers to evaluate with LLM.");
        return {};
    }

    const playerAnswersString = playerAnswersList.join('\n');

    // ** Refined prompt is INSIDE the function now **
    const prompt = `You are scoring answers for a trivia game.
Question: "${question['Вопрос']}"
Correct Answer: "${question['Ответ']}"
Answer Type Hint: "${question['Тип ответа']}"

Evaluate the following player answers based *only* on closeness or correctness relative to the Correct Answer. Award points:
- 3 points: Exact match or demonstrably equivalent meaning/value. Check numerical values carefully.
- 2 points: Clearly the closest answer if no one got 3 points, but still reasonably close.
- 0 points: Incorrect, irrelevant, or too far off.

If multiple players are equally closest (and no one got 3), they should BOTH get 2 points. If someone gets 3 points, no one else gets 2 points.

Player Answers:
${playerAnswersString}

Respond ONLY with a valid JSON object mapping player ID to their score (0, 2, or 3). Example: {"playerID1": 3, "playerID2": 0}`;

    // console.log("--- LLM PROMPT ---"); // Debug: Log the prompt
    // console.log(prompt);
    // console.log("------------------");

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;

        // Handle potential lack of text in response
        if (!response || !response.text) {
             throw new Error("LLM response was empty or invalid.");
        }

        let text = response.text();

        // Clean potential markdown code blocks
        text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

        // console.log("--- LLM RAW RESPONSE ---"); // Debug: Log raw response
        // console.log(text);
        // console.log("----------------------");

        let jsonResponse = JSON.parse(text); // This might throw if LLM response isn't valid JSON
        const validatedScores = {};

        // Validate scores and ensure all original players are included
        Object.keys(players).forEach(playerId => {
            const player = players[playerId];
            // Only process if the player object is valid
            if (player && player.id) {
                 const score = jsonResponse[playerId];
                 if ([0, 2, 3].includes(score)) {
                     validatedScores[playerId] = score;
                 } else {
                     // If score is missing or invalid, default to 0
                     console.warn(`LLM provided invalid or missing score for player ${playerId} (${player.name}). Defaulting to 0.`);
                     validatedScores[playerId] = 0;
                 }
            }
        });

        console.log("LLM Evaluation Scores:", validatedScores);
        return validatedScores;

    } catch (error) {
        console.error(`LLM evaluation error for Q[${question['№']}]:`, error);
        console.warn("Falling back to numerical evaluation due to LLM error.");
        // Fallback to numerical evaluation on error
        return evaluateNumerically(question['Ответ'], players);
    }
}
// *** END OF evaluateWithLLM FUNCTION ***


// parseValue and evaluateNumerically should also be defined within this file or imported if moved
function parseValue(valueStr) {
    if (valueStr === null || valueStr === undefined) return null;
    let originalStr = String(valueStr).trim().toLowerCase();
    if (!originalStr) return null;

    if (['бесконечно', 'бесконечность', 'бесконечное число', 'infinity'].includes(originalStr)) {
        return Infinity;
    }

    const bcMatch = originalStr.match(/^(\d+)\s*(?:до н\.э\.|b\.?c\.?e?\.?|bc|н\.э\.)$/);
    if (bcMatch) {
        const year = parseInt(bcMatch[1], 10);
        return !isNaN(year) ? -year : null;
    }

    let multiplier = 1;
    let strToParse = originalStr;

    if (strToParse.endsWith('квинтиллионов')) { multiplier = 1e18; strToParse = strToParse.replace(/квинтиллионов$/, '').trim(); }
    else if (strToParse.endsWith('млрд') || strToParse.endsWith('b') || strToParse.endsWith('миллиардов')) { multiplier = 1e9; strToParse = strToParse.replace(/млрд|b|миллиардов$/, '').trim(); }
    else if (strToParse.endsWith('млн') || strToParse.endsWith('m') || strToParse.endsWith('миллионов')) { multiplier = 1e6; strToParse = strToParse.replace(/млн|m|миллионов$/, '').trim(); }
    else if (strToParse.endsWith('тыс') || strToParse.endsWith('тысяч') || strToParse.endsWith('k')) { multiplier = 1e3; strToParse = strToParse.replace(/тыс|тысяч|k$/, '').trim(); }
    else if (strToParse.endsWith('%')) { strToParse = strToParse.replace(/%$/, '').trim(); }

    if (!strToParse) return null;

    const numStr = strToParse.replace(/,/g, '.').replace(/\s/g, '');

    if (/^(-?\d+(?:\.\d+)?)[eE][+-]?\d+$/.test(numStr)) {
        const sciValue = parseFloat(numStr);
        return !isNaN(sciValue) ? sciValue * multiplier : null;
    }
    if (/^(-?\d+(?:\.\d+)?)$/.test(numStr)) {
        const numValue = parseFloat(numStr);
        return !isNaN(numValue) ? numValue * multiplier : null;
    }

    // console.warn(`Could not parse player value: "${originalStr}"`); // Optional logging
    return null; // Failed to parse
}

function evaluateNumerically(correctAnswerRaw, players) {
    const scores = {};
     // Ensure players is a valid object
     const playerEntries = (players && typeof players === 'object') ? Object.entries(players) : [];

    if (correctAnswerRaw === null || correctAnswerRaw === undefined) {
        console.warn(`Null or undefined correct answer provided. Scoring all 0.`);
        playerEntries.forEach(([id]) => scores[id] = 0);
        return scores;
    }

    const correctAnswerStr = String(correctAnswerRaw).trim().toLowerCase();
    let minDiff = Infinity;
    let evaluationType = 'unknown';
    let correctValue = null;
    let rangeLower = null;
    let rangeUpper = null;

    // Determine evaluation type
    if (['бесконечно', 'бесконечность', 'бесконечное число', 'infinity'].includes(correctAnswerStr)) {
        evaluationType = 'infinity';
        correctValue = Infinity;
    } else {
        const rangeMatch = correctAnswerStr.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|–|—|до|to)\s*(-?\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
            rangeLower = parseFloat(rangeMatch[1]);
            rangeUpper = parseFloat(rangeMatch[2]);
            if (!isNaN(rangeLower) && !isNaN(rangeUpper)) {
                evaluationType = 'range';
                if (rangeLower > rangeUpper) [rangeLower, rangeUpper] = [rangeUpper, rangeLower];
                correctValue = (rangeLower + rangeUpper) / 2; // Midpoint for diff calculation
            } else {
                evaluationType = 'unknown';
                console.warn(`Malformed range in correct answer: "${correctAnswerRaw}"`);
            }
        } else if (/^(?:>|>=|<|<=|больше|менее|более|менее|до|от)\s*-?\d/.test(correctAnswerStr)) {
            evaluationType = 'unknown';
            console.warn(`Comparison operator found in correct answer: "${correctAnswerRaw}". Numerical evaluation skipped.`);
        } else if (/\d+\s*(?:до н\.э\.|b\.?c\.?e?\.?|bc|н\.э\.)$/.test(correctAnswerStr)) {
             correctValue = parseValue(correctAnswerStr);
             evaluationType = (correctValue !== null) ? 'exact' : 'unknown';
             if(evaluationType === 'unknown') console.warn(`Failed to parse BC date correct answer: "${correctAnswerRaw}"`);
        } else {
            correctValue = parseValue(correctAnswerStr);
            evaluationType = (correctValue !== null) ? 'exact' : 'unknown';
             if(evaluationType === 'unknown') console.warn(`Could not parse correct answer as number/range/infinity: "${correctAnswerRaw}"`);
        }
    }

    // Handle Unknown/Fallback
    if (evaluationType === 'unknown') {
        console.warn(`evaluateNumerically cannot handle: "${correctAnswerRaw}". Scoring 0.`);
        playerEntries.forEach(([id]) => scores[id] = 0);
        return scores;
    }

    // Evaluate Player Answers
    const playerResults = playerEntries.map(([id, player]) => {
        // Basic check for player object validity
        if (!player || typeof player !== 'object') {
            return { id, diff: Infinity, isExact: false };
        }

        const playerValue = parseValue(player.answer);
        let diff = Infinity;
        let isExact = false;

        if (playerValue !== null) { // Only evaluate if player answer was parsable
            if (evaluationType === 'infinity') {
                isExact = (playerValue === Infinity);
                diff = isExact ? 0 : Infinity;
            } else if (evaluationType === 'range') {
                isExact = (playerValue >= rangeLower && playerValue <= rangeUpper);
                if (isExact) {
                    diff = 0;
                } else {
                    // Difference from the *closest* boundary
                    diff = Math.min(Math.abs(playerValue - rangeLower), Math.abs(playerValue - rangeUpper));
                }
            } else { // 'exact'
                isExact = (playerValue === correctValue);
                diff = Math.abs(playerValue - correctValue);
            }
        }

        // Track the minimum difference among non-exact answers
        if (!isExact && diff < minDiff) {
            minDiff = diff;
        }
        return { id, diff, isExact };
    });

    // Assign Scores
    playerResults.forEach(pa => {
        if (pa.isExact) {
            scores[pa.id] = 3;
        } else if (evaluationType !== 'infinity' && pa.diff === minDiff && minDiff !== Infinity) {
            // Check if this non-exact answer's diff matches the minimum found
            scores[pa.id] = 2;
        } else {
            scores[pa.id] = 0;
        }
    });

    return scores;
}

// --- Reset ---
function requestResetHandler(playerId) {
    const gameState = gameStateManager.getGameState();
    if (!gameState) return;

    // Allow reset if initiated by host OR if the game is already over
    if (playerId === gameState.hostId || gameState.phase === 'game_over') {
        console.log(`Reset requested by ${playerId}. Current phase: ${gameState.phase}`);
        gameStateManager.resetGame(); // Reset the state (re-adds host if data exists)
        broadcastGameState(); // Notify everyone of the new lobby state
    } else {
        io?.to(playerId)?.emit('gameError', 'Only the host can reset the lobby (or wait until Game Over).');
    }
}

module.exports = {
    initializeGameLogic,
    isLLMAvailable,
    startGame,
    handleAnswer,
    requestResetHandler,
    broadcastGameState, // Export for use in server.js disconnect/error handling
    endGame // Export for use in server.js disconnect handling
};