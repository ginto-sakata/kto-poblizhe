// __tests__/scoringService.integration.test.js

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const scoringService = require('../scoringService'); // Adjust path if needed

//============================= Constants and Setup =============================
const QUESTIONS_FILE = path.join(__dirname, '..', 'data', 'game.csv'); // Path relative to this test file
const NUMERICAL_TYPES = ['число', 'год', 'процент', 'диапазон', 'количество', 'дата', 'время', 'масса', 'сила', 'деньги']; // Added types from CSV
const MAX_QUESTIONS_TO_TEST = 100; // Adjust how many questions to test each run

let allQuestions = [];

//============================= Load Questions Before Tests =============================
beforeAll(() => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(QUESTIONS_FILE)) {
            console.error(`Integration Test Error: Questions file not found at ${QUESTIONS_FILE}`);
            return reject(new Error('Questions file not found for integration test.'));
        }
        fs.createReadStream(QUESTIONS_FILE)
            .pipe(csv())
            .on('data', (row) => {
                // Basic cleaning similar to dataManager
                row.AI = parseInt(row.AI, 10) || 0;
                row['№'] = row['№'] || `generated_${allQuestions.length}`;
                row['Тип ответа'] = (row['Тип ответа'] || 'Unknown').toLowerCase(); // Standardize case
                allQuestions.push(row);
            })
            .on('end', () => {
                console.log(`Integration Test: Loaded ${allQuestions.length} questions.`);
                resolve();
            })
            .on('error', (error) => {
                console.error(`Integration Test Error loading questions:`, error);
                reject(error);
            });
    });
});

//============================= describe Real Question Tests =============================
describe('scoringService.evaluateNumerically with real questions', () => {
    let testableQuestions = [];

    beforeAll(() => {
        //======================== --- Filter Questions ---
        testableQuestions = allQuestions.filter(q =>
            q.AI === 0 && // Non-AI questions
            q['Ответ'] && // Must have an answer defined
            NUMERICAL_TYPES.includes(q['Тип ответа']) && // Must be a type we handle numerically
            scoringService.parseValue(q['Ответ']) !== null // Check if the *correct answer* itself is parsable
        );

        console.log(`Integration Test: Found ${testableQuestions.length} numerically testable non-AI questions.`);

        //======================== --- Select Subset ---
        if (testableQuestions.length > MAX_QUESTIONS_TO_TEST) {
            // Simple random sampling
            testableQuestions.sort(() => 0.5 - Math.random()); // Shuffle
            testableQuestions = testableQuestions.slice(0, MAX_QUESTIONS_TO_TEST);
            console.log(`Integration Test: Testing a random subset of ${testableQuestions.length} questions.`);
        }
    });

    //======================== --- Dynamically Generate Tests ---
    testableQuestions.forEach((question) => {
        const questionNum = question['№'];
        const correctAnswer = question['Ответ'];
        const questionText = question['Вопрос'] || '(No question text)';

        // --- Test Exact Match ---
        test(`Q[${questionNum}]: Correct answer "${correctAnswer}" should score 3`, () => {
            const players = {
                playerExact: { id: 'playerExact', name: 'Exacto', answer: correctAnswer }
            };
            const scores = scoringService.evaluateNumerically(correctAnswer, players);
            expect(scores['playerExact']).toBe(3);
        });

        // --- Test Clearly Wrong Match ---
        test(`Q[${questionNum}]: Incorrect answer "xyz" should score 0`, () => {
            const players = {
                playerWrong: { id: 'playerWrong', name: 'Wrongy', answer: "xyz" }
            };
            const scores = scoringService.evaluateNumerically(correctAnswer, players);
            expect(scores['playerWrong']).toBe(0);
        });

        // --- Add more specific 0-point tests if desired (e.g., test 0 if answer is large positive) ---

    });

    // --- Edge case: ensure the loop actually ran if questions were expected ---
    test('should have run tests if testable questions exist', () => {
        // This test just confirms the setup worked if there were questions
        const expectedToRun = allQuestions.some(q => q.AI === 0 && NUMERICAL_TYPES.includes(q['Тип ответа']));
        if (expectedToRun) {
            expect(testableQuestions.length).toBeGreaterThan(0);
        } else {
            expect(testableQuestions.length).toBe(0);
            console.log("Integration Test: No numerically testable non-AI questions found to run.");
        }
    });
});