// __tests__/llmService.integration.test.js

require('dotenv').config(); // Load environment variables (like API key)
const llmService = require('../llmservice'); // Adjust path if needed

//============================= Set Longer Timeout for API Calls =============================
jest.setTimeout(30000); // 30 seconds

//============================= describe LLM Service Integration =============================
describe('llmService.evaluateWithLLM Integration Test', () => {
    let isLlmReady = false;

    //======================== --- Initialize LLM before tests ---
    beforeAll(() => {
        // Initialize only if not already done by other tests/setup
        // This might run initializeLlm again if called elsewhere, but it should be safe.
        isLlmReady = llmService.initializeLlm(process.env.GEMINI_API_KEY);
        if (!isLlmReady) {
            console.warn("LLM Integration Test: LLM not available or failed to initialize. Skipping tests.");
        }
    });

    //======================== --- Test case, skipped if LLM is not ready ---
    // Use test.skipIf (or similar conditional logic) if your Jest version supports it,
    // otherwise, use a standard 'test' and check 'isLlmReady' inside.
    test('should evaluate a sample question via API and return scores/commentary object', async () => {
        if (!isLlmReady) {
            console.log("Skipping LLM integration test because LLM is not available.");
            return; // Skip execution if LLM isn't ready
        }

        //======================== --- Sample Data for Test ---
        const testQuestion = {
            '№': 13,
            'Тема': 'Аниме',
            'Подтема': 'Fairy Tail',
            'Вопрос': 'Сколько членов в гильдии Хвост Феи?',
            'Ответ': 'более 100', // Answer requiring interpretation
            'Тип ответа': 'количество',
            'AI': 1 // Marked for AI
        };
        const testPlayers = {
            'player1': { id: 'player1', name: 'Natsu', answer: 'Сотни! Может больше!' },
            'player2': { id: 'player2', name: 'Lucy', answer: 'Точно не помню, но много.' },
            'player3': { id: 'player3', name: 'Gray', answer: '5' },
        };

        //======================== --- Call the actual LLM Service ---
        const result = await llmService.evaluateWithLLM(testQuestion, testPlayers);

        //======================== --- Basic Structural Assertions ---
        expect(result).toBeDefined();
        expect(result).toHaveProperty('scores');
        expect(result).toHaveProperty('commentary');

        expect(typeof result.scores).toBe('object');
        expect(result.scores).not.toBeNull();
        expect(typeof result.commentary).toBe('string');
        expect(result.commentary.length).toBeGreaterThan(0); // Commentary should not be empty

        //======================== --- Check Scores Structure ---
        // Verify scores exist for each player and are valid numbers (0, 2, or 3)
        for (const playerId of Object.keys(testPlayers)) {
            expect(result.scores).toHaveProperty(playerId);
            const score = result.scores[playerId];
            expect(typeof score).toBe('number');
            expect([0, 2, 3]).toContain(score);
        }

        console.log("LLM Integration Test Commentary Received:", result.commentary); // Log commentary for manual check
    });
});