// public/uiUpdater.js

//=================================================================================
//                           --- UI Helper Functions ---
//=================================================================================

function sanitizeHTML(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = view.id === viewId ? 'block' : 'none';
    });
    // Clear errors/messages when changing views
    const joinError = document.getElementById('join-error');
    const settingsError = document.getElementById('settings-error');
    const answerFeedbackP = document.getElementById('answer-feedback');
    if (joinError) joinError.textContent = '';
    if (settingsError) settingsError.textContent = '';
    if (answerFeedbackP) answerFeedbackP.textContent = '';
}

//=================================================================================
//                         --- Player List Rendering ---
//=================================================================================

function renderPlayerListItem(player, isHostPlayer) {
    let avatarSvg = '';
    if (player.avatarOptions && typeof Avataaars !== 'undefined') {
         const listAvatarOptions = { ...player.avatarOptions, width: '24px', height: '24px' };
         try {
            avatarSvg = Avataaars.create(listAvatarOptions);
         } catch(e) { console.error("Error rendering list avatar", e); }
    } else {
         avatarSvg = `<span class="inline-block w-6 h-6 rounded-full bg-gray-300 align-middle mr-2"></span>`;
    }

    return `<li class="flex items-center gap-2 text-gray-700">
                ${avatarSvg}
                <span>${sanitizeHTML(player.name)} ${isHostPlayer ? '👑' : ''}</span>
            </li>`;
}

//=================================================================================
//                         --- Panel Update Functions ---
//=================================================================================

function updateLobbyStatusPanel(state) {
     const joinCurrentPlayers = document.getElementById('current-players');
     const joinMaxPlayers = document.getElementById('max-players');
     const joinHostName = document.getElementById('host-name');
     const joinPlayerList = document.getElementById('player-list');

     if (joinCurrentPlayers) joinCurrentPlayers.textContent = state.players?.length || 0;
     if (joinMaxPlayers) joinMaxPlayers.textContent = state.maxPlayers || '?';

     const host = state.players?.find(p => p.id === state.hostId);
     if (joinHostName) joinHostName.textContent = host ? sanitizeHTML(host.name) : 'N/A';

     if (joinPlayerList) {
        joinPlayerList.innerHTML = state.players?.length > 0
            ? state.players.map(p => renderPlayerListItem(p, p.id === state.hostId)).join('')
            : '<li class="text-gray-500 italic">(Empty)</li>';
     }
}

function updateOpponentInfoPanel(opponent) {
  const opponentInfoPanel = document.getElementById('opponent-info-panel');
  const opponentInfoAvatar = document.getElementById('opponent-info-avatar');
  const opponentInfoName = document.getElementById('opponent-info-name');
  const opponentInfoGames = document.getElementById('opponent-info-games');
  const opponentInfoScore = document.getElementById('opponent-info-score');
  const opponentInfoWins = document.getElementById('opponent-info-wins');

  if (!opponent || !opponentInfoPanel) return;

  if (opponentInfoAvatar && opponent.avatarOptions && typeof Avataaars !== 'undefined') {
      try {
          const opponentAvatarOptions = { ...opponent.avatarOptions, width: '128px', height: '128px' };
          opponentInfoAvatar.innerHTML = Avataaars.create(opponentAvatarOptions);
      } catch (e) {
          console.error("Error rendering opponent avatar", e);
          if(opponentInfoAvatar) opponentInfoAvatar.innerHTML = '?';
      }
  } else if (opponentInfoAvatar) {
       opponentInfoAvatar.innerHTML = '?';
  }

  if (opponentInfoName) opponentInfoName.textContent = opponent.name || 'Opponent';
  if (opponentInfoGames) opponentInfoGames.textContent = opponent.gamesPlayed !== undefined ? opponent.gamesPlayed : '?';
  if (opponentInfoScore) opponentInfoScore.textContent = opponent.totalScore !== undefined ? opponent.totalScore : '?';
  if (opponentInfoWins) opponentInfoWins.textContent = opponent.wins !== undefined ? opponent.wins : '?';
}

//=================================================================================
//                          --- View Update Functions ---
//=================================================================================

function updateLobbyView(state, isHost) {
    const lobbyCurrentPlayersSpan = document.getElementById('lobby-current-players');
    const lobbyMaxPlayersSpan = document.getElementById('lobby-max-players');
    const lobbyPlayerListContainer = document.getElementById('lobby-player-list-container');
    const lobbyHostNameSpan = document.getElementById('lobby-host-name');
    const gameModeSpan = document.getElementById('game-mode');
    const aiModeSpan = document.getElementById('ai-mode');
    const filteredQuestionCountSpan = document.getElementById('filtered-question-count');
    const leaderboardList = document.getElementById('leaderboard-list');
    const startGameButton = document.getElementById('start-game-button');
    const lobbyMessage = document.getElementById('lobby-message');
    const settingsButton = document.getElementById('settings-button');

    const playerCount = state.players?.length || 0;
    if (lobbyCurrentPlayersSpan) lobbyCurrentPlayersSpan.textContent = playerCount;
    if (lobbyMaxPlayersSpan) lobbyMaxPlayersSpan.textContent = state.maxPlayers || '?';

    if (lobbyPlayerListContainer) {
         lobbyPlayerListContainer.innerHTML = state.players?.length > 0
           ? state.players.map(p => renderPlayerListItem(p, p.id === state.hostId)).join('')
           : '<li class="text-gray-500 italic">(Empty)</li>';
    }

    const host = state.players?.find(p => p.id === state.hostId);
    if (lobbyHostNameSpan) lobbyHostNameSpan.textContent = host ? sanitizeHTML(host.name) : 'N/A';

    if (gameModeSpan) {
        let modeDesc = state.settings.gameMode;
        if(modeDesc === 'score') modeDesc += ` (Target: ${state.settings.targetScore})`;
        gameModeSpan.textContent = modeDesc;
    }
    if (aiModeSpan) aiModeSpan.textContent = state.settings.useAi?.replace('_', ' ') || '?';

    if (filteredQuestionCountSpan) filteredQuestionCountSpan.textContent = state.filteredQuestionCount ?? '?';

    if (leaderboardList) {
        leaderboardList.innerHTML = state.leaderboard?.length > 0
            ? state.leaderboard.map((entry, index) => `<li class="truncate"><span class="font-semibold">${index + 1}.</span> ${sanitizeHTML(entry.name)} - ${entry.score} pts (${entry.wins} wins)</li>`).join('')
            : '<li class="text-gray-500 italic">(Empty)</li>';
    }

    if (startGameButton) {
        startGameButton.disabled = !isHost || playerCount < 1;
        startGameButton.title = !isHost ? "Only the host can start" : (playerCount < 1 ? "Need at least 1 player" : "Start the game");
    }

    if (lobbyMessage) lobbyMessage.textContent = '';
    if (settingsButton) settingsButton.style.display = isHost ? 'inline-block' : 'none';
}

function updateSettingsView(state, isHost) {
    const settingsView = document.getElementById('settings-view');
    const settingsMaxPlayersSelect = document.getElementById('settings-max-players');
    const settingsGameModeSelect = document.getElementById('settings-game-mode');
    const settingsTargetScoreInput = document.getElementById('settings-target-score');
    const settingsAiModeSelect = document.getElementById('settings-ai-mode');
    const settingsLlmStatusSpan = document.getElementById('settings-llm-status');
    const settingsThemesListDiv = document.getElementById('settings-themes-list');
    const settingsAnswerTypesListDiv = document.getElementById('settings-answer-types-list');
    const settingsThemesCountSpan = document.getElementById('settings-themes-count');
    const settingsThemesTotalSpan = document.getElementById('settings-themes-total');
    const settingsTypesCountSpan = document.getElementById('settings-types-count');
    const settingsTypesTotalSpan = document.getElementById('settings-types-total');
    const settingsAvailableQuestionsSpan = document.getElementById('settings-available-questions');
    const applySettingsButton = document.getElementById('apply-settings-button');
    const selectAllButtons = document.querySelectorAll('.select-all-btn');
    const deselectAllButtons = document.querySelectorAll('.deselect-all-btn');

    const settings = state.settings;
    if (!settings) return;

    if (settingsMaxPlayersSelect) settingsMaxPlayersSelect.value = state.maxPlayers;
    if (settingsGameModeSelect) settingsGameModeSelect.value = settings.gameMode;
    if (settingsTargetScoreInput) {
        settingsTargetScoreInput.value = settings.targetScore;
        settingsTargetScoreInput.style.display = settings.gameMode === 'score' ? 'inline-block' : 'none';
    }

    if (settingsAiModeSelect) {
        if (settings.llmAvailable) {
            settingsAiModeSelect.value = 'always';
            settingsAiModeSelect.disabled = false;
            settingsAiModeSelect.classList.remove('bg-gray-100');
        } else {
            settingsAiModeSelect.value = 'never';
            settingsAiModeSelect.disabled = true;
            settingsAiModeSelect.classList.add('bg-gray-100');
        }
    }
    if (settingsLlmStatusSpan) settingsLlmStatusSpan.textContent = settings.llmAvailable ? `(${settings.llmModel})` : "(Not Available)";

    if (settingsThemesListDiv && settings.availableThemes) {
        settingsThemesListDiv.innerHTML = settings.availableThemes.map(theme => {
            const isChecked = settings.selectedThemes?.includes(theme);
            const checkboxId = `theme-${theme.replace(/[^a-zA-Z0-9]/g, '-')}`;
            return `<label for="${checkboxId}" class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input type="checkbox" id="${checkboxId}" value="${sanitizeHTML(theme)}" ${isChecked ? 'checked' : ''} class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300">
                        <span>${sanitizeHTML(theme)}</span>
                    </label>`;
        }).join('');
    }
    if (settingsThemesCountSpan) settingsThemesCountSpan.textContent = settings.selectedThemes?.length || 0;
    if (settingsThemesTotalSpan) settingsThemesTotalSpan.textContent = settings.availableThemes?.length || 0;

    if (settingsAnswerTypesListDiv && settings.availableAnswerTypes) {
        settingsAnswerTypesListDiv.innerHTML = settings.availableAnswerTypes.map(type => {
            const isChecked = settings.selectedAnswerTypes?.includes(type);
            const checkboxId = `type-${type.replace(/[^a-zA-Z0-9]/g, '-')}`;
            return `<label for="${checkboxId}" class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input type="checkbox" id="${checkboxId}" value="${sanitizeHTML(type)}" ${isChecked ? 'checked' : ''} class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300">
                        <span>${sanitizeHTML(type)}</span>
                    </label>`;
        }).join('');
    }
    if (settingsTypesCountSpan) settingsTypesCountSpan.textContent = settings.selectedAnswerTypes?.length || 0;
    if (settingsTypesTotalSpan) settingsTypesTotalSpan.textContent = settings.availableAnswerTypes?.length || 0;

    if (settingsAvailableQuestionsSpan) settingsAvailableQuestionsSpan.textContent = state.filteredQuestionCount ?? '?';

    const isSettingsDisabled = !isHost;
    [settingsMaxPlayersSelect, settingsGameModeSelect, settingsTargetScoreInput, applySettingsButton, ...selectAllButtons, ...deselectAllButtons].forEach(el => { if (el) el.disabled = isSettingsDisabled; });

    if (settingsThemesListDiv) settingsThemesListDiv.querySelectorAll('input').forEach(inp => inp.disabled = isSettingsDisabled);
    if (settingsAnswerTypesListDiv) settingsAnswerTypesListDiv.querySelectorAll('input').forEach(inp => inp.disabled = isSettingsDisabled);

    const controlsToStyle = settingsView ? settingsView.querySelectorAll('select, input, button') : [];
    if (isSettingsDisabled) {
        controlsToStyle.forEach(el => el.classList.add('opacity-70', 'cursor-not-allowed'));
    } else {
        controlsToStyle.forEach(el => el.classList.remove('opacity-70', 'cursor-not-allowed'));
        if (settingsAiModeSelect) {
            settingsAiModeSelect.disabled = !settings.llmAvailable;
             if (!settings.llmAvailable) {
                 settingsAiModeSelect.classList.add('opacity-70', 'cursor-not-allowed');
             }
        }
    }
}

function updateGameplayView(state, myPlayerId, lastRoundResultsMessage) {
    const playerScoresDiv = document.getElementById('player-scores');
    const previousRoundResultsDisplay = document.getElementById('previous-round-results-display');
    const previousRoundResultsPre = previousRoundResultsDisplay ? previousRoundResultsDisplay.querySelector('pre') : null;
    const questionNumberH3 = document.getElementById('question-number');
    const questionThemeSpan = document.getElementById('question-theme');
    const questionSubthemeSpan = document.getElementById('question-subtheme');
    const questionTextP = document.getElementById('question-text');
    const answerInput = document.getElementById('answer-input');
    const submitAnswerButton = document.getElementById('submit-answer-button');
    const answerFeedbackP = document.getElementById('answer-feedback');
    const submittedAnswersDiv = document.getElementById('submitted-answers');
    const submittedAnswersList = document.getElementById('submitted-answers-list');

    const question = state.currentQuestion;
    const me = state.players?.find(p => p.id === myPlayerId);

    if (previousRoundResultsDisplay && previousRoundResultsPre) {
        if (lastRoundResultsMessage) {
            previousRoundResultsPre.textContent = lastRoundResultsMessage;
            previousRoundResultsDisplay.classList.remove('hidden');
        } else {
            previousRoundResultsDisplay.classList.add('hidden');
        }
    }

    if (playerScoresDiv && state.players) {
        playerScoresDiv.textContent = 'Scores: ' + state.players
            .map(p => `${sanitizeHTML(p.name)}: ${p.score}`)
            .join(' | ');
    }

    if (question && questionNumberH3 && questionThemeSpan && questionSubthemeSpan && questionTextP) {
        questionNumberH3.textContent = `Question ${state.questionHistoryCount || '?'}`;
        questionThemeSpan.textContent = sanitizeHTML(question['Тема'] || '?');
        questionSubthemeSpan.textContent = sanitizeHTML(question['Подтема'] || 'N/A');
        questionTextP.textContent = sanitizeHTML(question['Вопрос'] || 'Loading question...');
    } else if (questionTextP) {
        questionTextP.textContent = 'Waiting for question...';
    }

    if (answerInput && submitAnswerButton && answerFeedbackP) {
        const canAnswer = me && !me.hasAnsweredThisRound && state.phase === 'playing';
        answerInput.disabled = !canAnswer;
        submitAnswerButton.disabled = !canAnswer;
        if (canAnswer) {
            answerInput.focus();
            answerFeedbackP.textContent = 'Enter your answer!';
            answerInput.classList.remove('bg-gray-100');
        } else if (me?.hasAnsweredThisRound) {
            answerFeedbackP.textContent = 'Your answer is submitted. Waiting for others...';
            answerInput.classList.add('bg-gray-100');
        } else {
             answerFeedbackP.textContent = 'Waiting for question or round to start...';
             answerInput.classList.add('bg-gray-100');
        }
    }

     if (submittedAnswersList && state.players) {
        submittedAnswersList.innerHTML = '';
        state.players.forEach(p => {
            const li = document.createElement('li');
            li.className = p.hasAnsweredThisRound ? 'text-green-600' : 'text-gray-400 italic';
            li.textContent = `${sanitizeHTML(p.name)}: ${p.hasAnsweredThisRound ? 'Submitted ✅' : 'Waiting...'}`;
            submittedAnswersList.appendChild(li);
        });
    }
    if(submittedAnswersDiv) submittedAnswersDiv.style.display = 'block';
}

function updateRoundEndView(state) {
    const roundResultsPre = document.querySelector('#round-results pre');
    if (roundResultsPre) {
        if (state.roundResults) {
            roundResultsPre.textContent = sanitizeHTML(state.roundResults.message);
            // lastRoundResultsMessage is managed in the main client.js now
        } else {
            roundResultsPre.textContent = 'Calculating results...';
        }
    }
}

function updateGameOverView(state, isHost) {
    const gameOverReasonP = document.getElementById('game-over-reason');
    const finalScoresList = document.getElementById('final-scores-list');
    const playAgainButton = document.getElementById('play-again-button');

    if (state.gameOverData && gameOverReasonP && finalScoresList) {
        gameOverReasonP.textContent = sanitizeHTML(state.gameOverData.reason);
        finalScoresList.innerHTML = Object.entries(state.gameOverData.scores)
            .map(([name, score]) => `<li class="font-medium">${sanitizeHTML(name)}: ${score}</li>`)
            .join('');
    }
    if (playAgainButton) {
        playAgainButton.disabled = !isHost && state.players?.length > 0;
        playAgainButton.title = !isHost && state.players?.length > 0 ? "Waiting for host to restart" : "Start a new game";
    }
}