// llmservice.js

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const scoringService = require('./scoringService');
const fs = require('fs'); // Import File System module
const path = require('path'); // Import Path module

let genAI;
let geminiModel;
let evaluationPromptTemplate = ''; // Variable to hold the prompt template

//============================= Load Prompt Template =============================
function loadPromptTemplate() {
    try {
        const promptPath = path.join(__dirname, 'prompts', 'evaluationPrompt.txt');
        if (!fs.existsSync(promptPath)) {
            throw new Error(`Prompt file not found at ${promptPath}`);
        }
        evaluationPromptTemplate = fs.readFileSync(promptPath, 'utf-8');
        console.log("LLM evaluation prompt loaded successfully.");
    } catch (error) {
        console.error("FATAL: Could not load LLM evaluation prompt from file:", error);
        // Consider exiting if the prompt is essential and cannot be loaded
        process.exit(1);
    }
}

//============================= Initialize LLM Service =============================
function initializeLlm(apiKey) {
    loadPromptTemplate(); // Load the prompt when initializing the service
    if (apiKey) {
        try {
            genAI = new GoogleGenerativeAI(apiKey);
            geminiModel = genAI.getGenerativeModel({
                 model: "gemini-2.0-flash", // Using the non-lite flash model
                 safetySettings: [
                     { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                     { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                     { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                     { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                 ],
                 generationConfig: {
                     // Relying on prompt instructions for JSON, not schema enforcement
                 },
            });
            console.log("Gemini AI Initialized in llmService using gemini-2.0-flash (Text Response Expected).");
            return true;
        } catch (error) {
            console.error("Failed to initialize Gemini AI:", error.message);
            geminiModel = null;
            return false;
        }
    } else {
        console.warn("GEMINI_API_KEY not found. LLM features will be disabled.");
        geminiModel = null;
        return false;
    }
}

//============================= Check LLM Availability =============================
function isLLMAvailable() {
    return !!geminiModel;
}

//============================= Evaluate with LLM =============================
async function evaluateWithLLM(question, players) {
    const defaultResult = { scores: {}, commentary: "Не удалось получить комментарий от ИИ." };

    if (!geminiModel) {
        console.warn("LLM not available. Falling back to numerical evaluation.");
        defaultResult.scores = scoringService.evaluateNumerically(question['Ответ'], players);
        defaultResult.commentary = "(ИИ недоступен)";
        return defaultResult;
    }
    if (!players || typeof players !== 'object' || Object.keys(players).length === 0) {
        console.log("No players or invalid players object to evaluate with LLM.");
        return defaultResult;
    }

    const playerAnswersList = Object.values(players)
        .filter(p => p && p.id && p.name)
        .map(p => `- ${p.name} (ID ${p.id}): "${p.answer || '(нет ответа)'}"`);

    if (playerAnswersList.length === 0) {
        console.log("No valid player answers to evaluate with LLM.");
        return defaultResult;
    }

    const playerAnswersString = playerAnswersList.join('\n');
    const playerIds = Object.keys(players);

    //======================== --- Prepare Prompt Content from Template ---
    let promptContent = evaluationPromptTemplate;
    if (!promptContent) {
         console.error("LLM evaluation prompt template is not loaded!");
         return { scores: {}, commentary: "Ошибка: шаблон промпта не загружен." };
    }
    try {
        promptContent = promptContent
            .replace(/\$\{question\['Вопрос'\]\}/g, question['Вопрос'] || 'Н/Д')
            .replace(/\$\{question\['Ответ'\]\}/g, question['Ответ'] || 'Н/Д')
            .replace(/\$\{playerAnswersString\}/g, playerAnswersString)
            .replace(/\$\{playerIds\.join\(', '\)\}/g, playerIds.join(', '));
     } catch(e) {
         console.error("Error replacing placeholders in prompt:", e);
         return { scores: {}, commentary: "Ошибка: не удалось создать промпт."};
     }


    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            console.log(`LLM Request (Attempt ${attempts}): Evaluating Q[${question['№']}]`);
            const result = await geminiModel.generateContent(promptContent);
            const response = await result.response;
            const text = response.text();

            if (!text) {
                 throw new Error("LLM response was empty.");
            }

            //======================== --- Try Parsing the Text Response as JSON ---
            let jsonResponse;
            try {
                 const cleanedText = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
                 jsonResponse = JSON.parse(cleanedText);
            } catch (parseError) {
                console.error(`LLM Response (Attempt ${attempts}) was not valid JSON:`, text);
                if (attempts === maxAttempts) {
                    console.warn("Max attempts reached. Falling back to numerical evaluation due to JSON parsing error.");
                    throw parseError;
                }
                console.log(`Retrying LLM evaluation (Attempt ${attempts + 1}/${maxAttempts})...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }


            //======================== --- Validate Parsed JSON Structure ---
            if (typeof jsonResponse !== 'object' || jsonResponse === null ||
                typeof jsonResponse.scores !== 'object' || jsonResponse.scores === null ||
                typeof jsonResponse.commentary !== 'string' )
            {
                console.error(`LLM Response (Attempt ${attempts}) JSON structure invalid:`, jsonResponse);
                 if (attempts === maxAttempts) {
                     console.warn("Max attempts reached. Falling back to numerical evaluation due to invalid structure.");
                     throw new Error("LLM produced invalid JSON structure after parsing.");
                 }
                 console.log(`Retrying LLM evaluation (Attempt ${attempts + 1}/${maxAttempts})...`);
                 await new Promise(resolve => setTimeout(resolve, 1000));
                 continue;
            }


            //======================== --- Validate Scores and Commentary ---
            const validatedScores = {};
            const commentary = jsonResponse.commentary.trim();
            const rawScores = jsonResponse.scores;

            let allPlayersScored = true;
            Object.keys(players).forEach(playerId => {
                 // Handle potential placeholder from previous schema attempt if LLM still adds it
                 if (playerId === '_placeholder') return;

                const score = rawScores[playerId];
                if ([0, 2, 3].includes(score)) {
                    validatedScores[playerId] = score;
                } else {
                    console.warn(`LLM response missing or invalid score for player ${playerId}. Score received: ${score}`);
                    allPlayersScored = false;
                    validatedScores[playerId] = 0;
                }
            });

            if (!allPlayersScored && attempts < maxAttempts) {
                 console.log(`Retrying LLM evaluation because not all players had valid scores (Attempt ${attempts + 1}/${maxAttempts})...`);
                 await new Promise(resolve => setTimeout(resolve, 1000));
                 continue;
            }

            console.log("LLM Evaluation Successful Scores:", validatedScores);
            if (commentary === "") console.warn("LLM commentary was empty.");

            return { scores: validatedScores, commentary: commentary };

        } catch (error) {
            console.error(`LLM evaluation error on attempt ${attempts} for Q[${question['№']}]:`, error.message);
            if (attempts === maxAttempts) {
                 console.warn("Max attempts reached. Falling back to numerical evaluation due to LLM error.");
                 let errorDetails = error.message;
                 if (error.response && error.response.promptFeedback) {
                     errorDetails += ` | Feedback: ${JSON.stringify(error.response.promptFeedback)}`;
                 }
                 return {
                     scores: scoringService.evaluateNumerically(question['Ответ'], players),
                     commentary: `(Ошибка ИИ: ${errorDetails.substring(0, 100)}...)`
                 };
            }
             console.log(`Retrying LLM evaluation after error (Attempt ${attempts + 1}/${maxAttempts})...`);
             await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
    }

     console.error(`LLM evaluation failed definitively after ${maxAttempts} attempts for Q[${question['№']}]`);
     // Use default scoring as fallback after all retries
     defaultResult.scores = scoringService.evaluateNumerically(question['Ответ'], players);
     defaultResult.commentary = "(ИИ не смог обработать ответ после нескольких попыток)";
     return defaultResult;
}

module.exports = {
    initializeLlm,
    isLLMAvailable,
    evaluateWithLLM
};