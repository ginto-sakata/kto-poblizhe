// gameController.js

const dataManager = require('./dataManager');
const gameStateManager = require('./gameStateManager');
const llmService = require('./llmservice');
const scoringService = require('./scoringService');

let io;

//============================= Initialize Controller =============================
function initialize(socketIoInstance) {
    io = socketIoInstance;
    if (!io) {
        console.error("FATAL: Socket.IO instance not provided to gameController.initialize");
        process.exit(1);
    }
}

//============================= Broadcast Game State =============================
function broadcastGameState() {
    const gameState = gameStateManager.getGameState();
    if (!gameState) {
        console.error("broadcastGameState called before gameState is initialized.");
        return;
    }
    Object.keys(gameState.players).forEach(id => {
        const socket = io?.sockets?.sockets?.get(id);
        if (socket) {
            const sanitizedState = gameStateManager.getSanitizedGameState(id, llmService.isLLMAvailable());
            if (sanitizedState) {
                socket.emit('updateState', sanitizedState);
            } else {
                 console.error(`Failed to get sanitized game state for player ${id}`);
            }
        }
    });
}

//============================= Start Game =============================
function startGame(playerId) {
    const gameState = gameStateManager.getGameState();
    if (!gameState) { io?.to(playerId)?.emit('gameError', 'Игра не готова.'); return; }

    if (playerId !== gameState.hostId) {
        io?.to(playerId)?.emit('gameError', 'Только ведущий может начать игру.');
        return;
    }
    if (Object.keys(gameState.players).length < 1) {
        io?.to(playerId)?.emit('gameError', 'Нужен хотя бы 1 игрок для старта.');
        return;
    }

    gameStateManager.updateFilteredQuestions();
    if (gameState.filteredQuestionCount === 0) {
        io?.to(playerId)?.emit('gameError', 'Нет вопросов для текущих настроек фильтра.');
        return;
    }

    console.log(`Game started by host ${playerId}`);
    gameState.phase = 'playing';
    gameState.questionHistory = [];
    gameState.roundResults = null;
    gameState.gameOverData = null;

    Object.values(gameState.players).forEach(p => {
        p.score = 0;
        p.answer = null;
        p.hasAnsweredThisRound = false;
        p.lastScore = null;
        dataManager.updatePlayerStatInMemory(p.id, 'gamesPlayed', 1);
    });

    nextRound();
}

//============================= Next Round =============================
function nextRound() {
    const gameState = gameStateManager.getGameState();
    if (!gameState || gameState.phase === 'game_over') {
         console.log("nextRound skipped: game state invalid or game over.");
         return;
    }

    Object.values(gameState.players).forEach(p => {
        p.answer = null;
        p.hasAnsweredThisRound = false;
        p.lastScore = null;
    });
    gameState.roundResults = null;
    gameState.currentQuestion = null;

    gameStateManager.updateFilteredQuestions(); // Update count based on current settings
    const questions = dataManager.getQuestions();
    const history = gameState.questionHistory;
    const currentThemes = gameState.settings.selectedThemes;
    const currentTypes = gameState.settings.selectedAnswerTypes;
    const useAiMode = gameState.settings.useAi;

    if (!questions || questions.length === 0) {
        console.error("No questions loaded.");
        endGame("Ошибка: Вопросы не найдены.");
        return;
    }

    // Filter questions based on history, themes, types, AND AI mode if applicable
    const uniqueAvailableQuestions = questions.filter(q => {
        const themeMatch = currentThemes.includes(q['Тема']);
        const typeMatch = currentTypes.includes(q['Тип ответа']);
        const notInHistory = !history.includes(q['№']);
        const baseCheck = q && q['№'] && q['Тема'] && q['Тип ответа'] && notInHistory && themeMatch && typeMatch;

        // Apply AI column filtering only if mode is 'no_ai'
        if (useAiMode === 'no_ai') {
            return baseCheck && q.AI === 0;
        } else {
            return baseCheck; // Other modes don't filter by AI column
        }
    });


    if (uniqueAvailableQuestions.length === 0) {
        let reason = "Закончились уникальные вопросы для этих настроек!";
        if (gameState.filteredQuestionCount === 0) {
             reason = "Нет вопросов, соответствующих выбранным фильтрам.";
        } else if (useAiMode === 'no_ai' && gameState.filteredQuestionCount > 0) {
            reason = "Закончились вопросы, подходящие для режима 'Без ведущего' (AI=0)."
        }
        console.log(reason);
        endGame(reason);
        return;
    }

    const randomIndex = Math.floor(Math.random() * uniqueAvailableQuestions.length);
    gameState.currentQuestion = uniqueAvailableQuestions[randomIndex];
    gameState.questionHistory.push(gameState.currentQuestion['№']);

    console.log(`Starting Round ${gameState.questionHistory.length}. Q[${gameState.currentQuestion['№']}]: ${gameState.currentQuestion['Вопрос']}`);
    gameState.phase = 'playing';
    broadcastGameState();
}

//============================= Handle Answer =============================
function handleAnswer(playerId, answer) {
    const gameState = gameStateManager.getGameState();
    if (!gameState || gameState.phase !== 'playing') { io?.to(playerId)?.emit('gameError', 'Ответы сейчас не принимаются.'); return; }
    if (!gameState.currentQuestion) { io?.to(playerId)?.emit('gameError', 'Нет активного вопроса.'); return; }

    const player = gameState.players[playerId];
    if (!player) { console.warn(`Answer from non-player ID: ${playerId}`); return; }
    if (player.hasAnsweredThisRound) { io?.to(playerId)?.emit('gameError', 'Вы уже ответили в этом раунде.'); return; }

    // Input should already be somewhat sanitized by client-side JS
    const submittedAnswer = String(answer || '').trim().slice(0, 200);
    if (!submittedAnswer) { io?.to(playerId)?.emit('gameError', 'Ответ не может быть пустым.'); return; }

    console.log(`Player ${player.name} (ID: ${playerId}) answered: ${submittedAnswer}`);
    player.answer = submittedAnswer;
    player.hasAnsweredThisRound = true;

    broadcastGameState();
    checkRoundCompletion();
}

//============================= Check Round Completion =============================
function checkRoundCompletion() {
    const gameState = gameStateManager.getGameState();
    if (!gameState || gameState.phase !== 'playing') return;
    const playersInGame = Object.values(gameState.players);
    if (playersInGame.length === 0) { console.log("No players left, ending game."); endGame("В игре не осталось игроков."); return; }
    const allAnswered = playersInGame.every(p => p.hasAnsweredThisRound);
    if (allAnswered) {
        console.log("All players answered. Evaluating round.");
        gameState.phase = 'round_end';
        broadcastGameState();
        evaluateRound();
    }
}

//============================= Evaluate Round =============================
async function evaluateRound() {
    const gameState = gameStateManager.getGameState();
    if (!gameState || !gameState.currentQuestion) { console.error("EvaluateRound missing question/state."); checkEndGameOrNextRound(); return; }
    const players = gameState.players;
    if (Object.keys(players).length === 0) { console.log("No players to evaluate."); gameState.roundResults = { scores: {}, message: "Раунд окончен: нет игроков." }; checkEndGameOrNextRound(); return; }

    const question = gameState.currentQuestion;
    const correctAnswerRaw = question['Ответ'];

    //======================== --- Determine if LLM should be used ---
    let useLLM = false;
    if (llmService.isLLMAvailable()) {
        if (gameState.settings.useAi === 'ai_always') {
            useLLM = true;
        } else if (gameState.settings.useAi === 'auto') {
            const playerAnswers = Object.values(players).map(p => p.answer);
            const anyPlayerNonNumeric = playerAnswers.some(ans => {
                if (ans === null || ans === undefined || String(ans).trim() === '') return false;
                return scoringService.parseValue(ans) === null;
            });

            const correctAnswerIsNonNumeric = scoringService.parseValue(correctAnswerRaw) === null;

            if (anyPlayerNonNumeric || correctAnswerIsNonNumeric) {
                useLLM = true;
                console.log(`Auto AI mode: Using LLM. Player non-numeric: ${anyPlayerNonNumeric}, Correct non-numeric: ${correctAnswerIsNonNumeric}`);
            } else {
                 console.log("Auto AI mode: All answers and correct answer were numerical (or empty), using numerical scoring.");
            }
        }
    }
    //======================== --- End LLM Usage Determination ---


    let roundScores = {};
    let llmCommentary = "";
    let evaluationMessage = "";

    console.log(`Evaluating R${gameState.questionHistory.length}, Q[${question['№']}], Correct: "${correctAnswerRaw}", Use LLM: ${useLLM}`);

    try {
        if (useLLM) {
            const llmResult = await llmService.evaluateWithLLM(question, players);
            roundScores = llmResult.scores;
            llmCommentary = llmResult.commentary;
            evaluationMessage = `(AI) Правильный ответ: ${correctAnswerRaw}.`;
        } else {
            // Should only get here if mode is 'no_ai' or 'auto' with fully numeric answers/question
            roundScores = scoringService.evaluateNumerically(correctAnswerRaw, players);
            evaluationMessage = `Правильный ответ: ${correctAnswerRaw}. `;
             if (gameState.settings.useAi === 'auto') {
                 evaluationMessage += "(Режим Авто: только числа)";
             } else if (gameState.settings.useAi === 'no_ai') {
                 evaluationMessage += "(Режим Без ведущего)";
             }
        }
    } catch (error) {
        console.error(`Evaluation Error (Q: ${question['№']}):`, error);
        evaluationMessage = "Ошибка при оценке.";
        Object.keys(players).forEach(id => roundScores[id] = 0);
    }

    //======================== --- Process Scores & Summary ---
    let roundSummaryLines = llmCommentary ? [llmCommentary, "---"] : [];
    roundSummaryLines.push(evaluationMessage);

    let bestPlayerNames = []; let maxPointsThisRound = 0;

    Object.entries(players).forEach(([playerId, player]) => {
        if(!player) return;
        const points = roundScores[playerId] ?? 0;
        player.score += points;
        player.lastScore = points;
        dataManager.getPlayerData(playerId, player.name, player.avatarOptions);
        dataManager.updatePlayerStatInMemory(playerId, 'totalScore', points);
        dataManager.updatePlayerStatInMemory(playerId, 'answerStats', points);
        roundSummaryLines.push(`${player.name}: "${player.answer || '-'}" => ${points} pt (Всего: ${player.score})`);
        if (points > maxPointsThisRound) { maxPointsThisRound = points; bestPlayerNames = [player.name]; }
        else if (points === maxPointsThisRound && points > 0 && !bestPlayerNames.includes(player.name)) { bestPlayerNames.push(player.name); }
    });

    if (bestPlayerNames.length > 0 && maxPointsThisRound > 0) {
        let winnerMsg = `${bestPlayerNames.join(' и ')} `;
        winnerMsg += (maxPointsThisRound === 3) ? 'точно!' : 'ближе всех!';
        roundSummaryLines.splice(llmCommentary ? 1 : 0, 0, winnerMsg);
    } else { roundSummaryLines.splice(llmCommentary ? 1 : 0, 0, "Никто не получил очков."); }

    gameState.roundResults = { scores: roundScores, message: roundSummaryLines.join('\n') };
    console.log(`R${gameState.questionHistory.length} Results:\n${gameState.roundResults.message}`);
    checkEndGameOrNextRound();
}


//============================= Check End Game or Next Round =============================
function checkEndGameOrNextRound() {
    const gameState = gameStateManager.getGameState();
    if (!gameState || gameState.phase === 'game_over') { return; }
    let gameOver = false; let winner = null; let reason = "";
    const playersArray = Object.values(gameState.players);

    //======================== --- Check Score Win ---
    if (gameState.settings.gameMode === 'score' && playersArray.length > 0) {
        const playersReachedScore = playersArray.filter(p => p.score >= gameState.settings.targetScore);
        if (playersReachedScore.length > 0) {
            gameOver = true;
            const sortedWinners = playersReachedScore.sort((a, b) => b.score - a.score); const highestScore = sortedWinners[0].score;
            const potentialWinners = sortedWinners.filter(p => p.score === highestScore);
            if (potentialWinners.length === 1) { winner = potentialWinners[0]; reason = `${winner.name} достиг(ла) ${gameState.settings.targetScore} очков!`; }
            else { winner = null; reason = `Ничья! ${potentialWinners.map(p => p.name).join(' и ')} достигли ${highestScore} очков!`; }
        }
    }
    //======================== --- Check Out of Questions ---
    if (!gameOver && gameState.phase !== 'lobby') {
        gameStateManager.updateFilteredQuestions(); // Update count based on current filters
        const questions = dataManager.getQuestions();
        const history = gameState.questionHistory || [];
        const currentThemes = gameState.settings.selectedThemes || [];
        const currentTypes = gameState.settings.selectedAnswerTypes || [];
        const useAiMode = gameState.settings.useAi;

        if (!questions || questions.length === 0) {
             gameOver = true; reason = "Ошибка: Вопросы не загружены."; console.error(reason);
        } else {
            const remainingUniqueQuestions = questions.filter(q => {
                 const themeMatch = currentThemes.includes(q['Тема']);
                 const typeMatch = currentTypes.includes(q['Тип ответа']);
                 const notInHistory = !history.includes(q['№']);
                 const baseCheck = q && q['№'] && q['Тема'] && q['Тип ответа'] && notInHistory && themeMatch && typeMatch;

                 if (useAiMode === 'no_ai') {
                     return baseCheck && q.AI === 0;
                 } else {
                     return baseCheck;
                 }
            }).length;

            if (remainingUniqueQuestions === 0) {
                gameOver = true;
                reason = "Закончились уникальные вопросы для выбранных фильтров";
                if (useAiMode === 'no_ai') reason += " (в режиме 'Без ведущего')";
                reason += "!";

                if (playersArray.length > 0) {
                    const sortedPlayers = playersArray.sort((a, b) => b.score - a.score);
                    const highestScore = sortedPlayers[0].score;
                    if (highestScore <= 0) {
                        winner = null; reason += " Победителя нет.";
                    } else {
                        const potentialWinners = sortedPlayers.filter(p => p.score === highestScore);
                        if (potentialWinners.length === 1) {
                            winner = potentialWinners[0]; reason += ` ${winner.name} побеждает с ${highestScore} очками!`;
                        } else {
                            winner = null; reason += ` Ничья при ${highestScore} очках: ${potentialWinners.map(p => p.name).join(' и ')}!`;
                        }
                    }
                } else {
                    winner = null; reason += " Нет игроков.";
                }
            }
        }
    }
    //======================== --- Transition ---
    if (gameOver) { endGame(reason, winner); }
    else {
        console.log(`Broadcasting round results. Next round in ~6 seconds.`);
        broadcastGameState();
        setTimeout(() => {
            const currentGameState = gameStateManager.getGameState();
            if (currentGameState && currentGameState.phase === 'round_end') { nextRound(); }
            else { console.log(`Next round aborted, game phase changed to ${currentGameState?.phase}.`); }
        }, 6000);
    }
}

//============================= End Game =============================
function endGame(reason, winner = null) {
    const gameState = gameStateManager.getGameState();
    if (!gameState || gameState.phase === 'game_over') { return; }
    gameState.phase = 'game_over';
    console.log(`Game Over: ${reason}`);
    const finalScores = {}; const playersArray = Object.values(gameState.players);
    playersArray.forEach(p => { if (p && p.name) finalScores[p.name] = p.score || 0; });
    gameState.gameOverData = {
        winnerName: winner ? winner.name : (playersArray.length > 1 ? "Ничья!" : (playersArray.length === 1 ? playersArray[0]?.name || "N/A" : "N/A")),
        reason: reason, scores: finalScores
    };
    if (winner) { dataManager.updatePlayerStatInMemory(winner.id, 'wins', 1); }
    dataManager.savePlayers();
    console.log("Player stats saved on game end.");
    broadcastGameState();
}

//============================= Request Reset Handler =============================
function requestResetHandler(playerId) {
    const gameState = gameStateManager.getGameState();
    if (!gameState) return;
    if (playerId === gameState.hostId || gameState.phase === 'game_over') {
        console.log(`Reset requested by ${playerId}. Current phase: ${gameState.phase}`);
        gameStateManager.resetGame();
        broadcastGameState();
    } else { io?.to(playerId)?.emit('gameError', 'Только ведущий может сбросить лобби (или дождитесь конца игры).'); }
}


module.exports = {
    initialize,
    startGame,
    handleAnswer,
    requestResetHandler,
    broadcastGameState,
    endGame
};