// public/rightJoinPanel.js

//=================================================================================
//                         --- Right Join Panel HTML Generator ---
//=================================================================================

function getRightJoinPanelHTML() {
    return `
        <!-- Lobby Status Content -->
        <div id="lobby-status-wrapper" class="flex-grow" style="display: block;">
            <h2 class="text-xl font-bold mb-6">Lobby Status</h2>
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <span class="block text-sm text-gray-500">Players</span>
                    <span id="current-players" class="font-semibold">0</span>/<span id="max-players" class="font-semibold">?</span>
                </div>
                <div>
                    <span class="block text-sm text-gray-500">Host</span>
                    <span id="host-name" class="font-semibold">N/A</span>
                </div>
            </div>
            <h3 class="font-semibold mb-2">Players:</h3>
            <ul id="player-list" class="space-y-2 flex-grow overflow-y-auto max-h-40">
                <li class="text-gray-500 italic">(Empty)</li>
            </ul>
        </div>

        <!-- Opponent Info Panel -->
        <div id="opponent-info-panel" class="flex-grow flex flex-col items-center justify-center" style="display: none;">
             <div id="opponent-info-avatar" class="w-32 h-32 mb-4 rounded-full bg-gray-300 flex items-center justify-center text-gray-500">
                 ?
             </div>
             <h3 id="opponent-info-name" class="text-xl font-semibold mb-2">Opponent Name</h3>
             <p class="text-sm text-gray-600">Played games: <span id="opponent-info-games">?</span></p>
             <p class="text-sm text-gray-600">Total Score: <span id="opponent-info-score">?</span></p>
             <p class="text-sm text-gray-600">Wins: <span id="opponent-info-wins">?</span></p>
        </div>

         <!-- Action Button Container -->
        <div class="mt-auto pt-4">
             <button
               id="lobby-action-button"
               class="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
             >
               Create Lobby
             </button>
        </div>
    `;
}