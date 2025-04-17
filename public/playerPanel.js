// public/playerPanel.js

//=================================================================================
//                         --- Player Panel HTML Generator ---
//=================================================================================

function getPlayerPanelHTML() {
    return `
        <div class="flex-1 flex flex-col items-center justify-center">
            <div class="relative mb-6 group">
            <div id="avatar-container" class="w-40 h-40 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 shadow-inner overflow-hidden relative">
                <!-- Avatar SVG added by client.js -->
            </div>
            <button
                id="randomize-avatar"
                class="mt-3 mx-auto flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Randomize
            </button>
            </div>

            <div class="w-full max-w-xs mb-6">
            <label for="player-name-input" class="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
            <input
                type="text"
                id="player-name-input"
                placeholder="Enter your display name"
                class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                maxlength="20"
            >
            </div>
        </div>
        <button
            id="customize-avatar-button"
            class="w-full py-3 px-6 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
        >
            Customize Avatar (WIP)
        </button>
        <p id="join-error" class="mt-3 text-sm text-red-500 text-center min-h-[1.25rem]"></p>
    `;
}