const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } = require("@google/generative-ai");

const scoringService = require('./scoringService'); // For fallback

let genAI;
let geminiModel;


function initializeLlm(apiKey) {
    if (apiKey) {
        try {
            genAI = new GoogleGenerativeAI(apiKey);
            geminiModel = genAI.getGenerativeModel({
                 model: "gemini-2.0-flash-lite", // *** Use specified model ***
                 // Configure safety settings if needed - adjust as necessary
                 safetySettings: [
                     { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                     { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                     { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                     { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                 ],
                 // *** Configure for JSON output with schema ***
                 generationConfig: {
                     responseMimeType: "application/json",
                     responseSchema: {
                        type: "OBJECT",
                        properties: {
                          scores: {
                            type: "OBJECT",
                            description: "Объект с оценками игроков. Ключ - ID игрока (строка), значение - оценка (число).",
                            propertyNames: {
                              "type": "string"
                            },
                            properties: {},  // ADDED THIS EMPTY PROPERTIES DEFINITION
                            required: []
                          },
                          commentary: {
                            type: "STRING",
                            description: "Комментарий ведущего на русском языке об ответах раунда, включая интересный факт, шутку или похвалу.",
                            nullable : false,
                          },
                        },
                        required: [
                          "scores",
                          "commentary",
                        ],
                      },
                 },
            });
            console.log("Gemini AI Initialized in llmService using gemini-2.0-flash-lite with JSON schema.");
            return true; // Indicate success
        } catch (error) {
            console.error("Failed to initialize Gemini AI:", error.message);
            geminiModel = null;
            return false; // Indicate failure
        }
    } else {
        console.warn("GEMINI_API_KEY not found. LLM features will be disabled.");
        geminiModel = null;
        return false; // Indicate LLM not available
    }
}

function isLLMAvailable() {
    return !!geminiModel;
}

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

    // --- Updated Prompt (Schema is now in config, prompt focuses on task) ---
    const promptContent = `
Ты — харизматичный и остроумный ведущий викторины "Кто Поближе?", способный шутить, удивляться редким фактам и подшучивать над игроками за промахи. Твоя задача — оценить ответы игроков и дать яркий, живой комментарий на русском языке, используя предоставленную JSON-схему.

Вопрос: **"\${question['Вопрос']}"**  
Правильный ответ: **"\${question['Ответ']}"**  
Ответы игроков для оценки:
${playerAnswersString}

### Правила оценки (ключ "scores" в JSON):
- **3 очка** – Если игрок дал точный или эквивалентный ответ. Будь внимателен к числам!  
- **2 очка** – Если никто не попал в 3 очка, но ответ одного или нескольких игроков заметно ближе остальных. Если несколько игроков одинаково близки, они ВСЕ получают по 2 очка.  
- **0 очков** – Если ответ неверный или слишком далёк от истины (и да, тут можно немного подколоть).  

### Комментарий (ключ "commentary" в JSON):
Твой комментарий — это не скучный разбор ошибок, а шоу! Он должен быть:  
- **Весёлым** – шути, стеби, но в меру дружелюбно.  
- **Остроумным** – можешь удивляться неожиданным ответам, подмечать гениальные промахи.  
- **Познавательным** – добавляй интересные факты по теме.  
- **Интерактивным** – хвали меткие догадки и подкалывай эпичные провалы.  

**Примеры фраз, которые можно использовать:**  
- 🎯 "Бинго! \${Object.values(players)[0]?.name || 'Игрок'} попал в десятку! Хотя, признаемся, вопрос был лёгкий..."  
- 🤯 "Что?! \${Object.values(players)[1]?.name || 'Кто-то'} серьёзно написал **это**? Теперь мне страшно..."  
- 📚 "А вот вам неожиданный факт: \${random_fact_about_topic}"  
- 🧐 "Ну почти! Но нет. Ближе всех оказался \${Object.values(players)[2]?.name || 'игрок'}!"  
- 😂 "Хорошая попытка, но нет. Хотя я бы хотел жить в мире, где это правда!"
Возвращай JSON, соответствующий предоставленной схеме.`;
    // --- End of Updated Prompt ---


    try {
        // console.log("--- LLM PROMPT CONTENT ---"); // Debug
        // console.log(promptContent);
        // console.log("--------------------------");

        const result = await geminiModel.generateContent(promptContent); // Pass only the text content
        const response = await result.response;

        if (!response || !response.candidates?.length || !response.candidates[0].content?.parts?.length) {
             throw new Error("LLM response structure invalid or empty candidates/parts.");
        }

        // Access JSON directly from the first candidate's part
        const jsonResponse = response.candidates[0].content.parts[0].functionCall
                              ? response.candidates[0].content.parts[0].functionCall.args // If using function calling style schema
                              : response.candidates[0].content.parts[0].text // If using direct text JSON output
                                ? JSON.parse(response.candidates[0].content.parts[0].text) // Parse text if available
                                : null; // Fallback

         if (!jsonResponse) {
             throw new Error("Could not extract valid JSON data from LLM response part.");
         }

        // console.log("--- LLM PARSED RESPONSE ---"); // Debug
        // console.log(JSON.stringify(jsonResponse, null, 2));
        // console.log("--------------------------");

        // --- Validate Scores and Commentary from parsed JSON ---
        const validatedScores = {};
        const commentary = (jsonResponse && typeof jsonResponse.commentary === 'string')
                            ? jsonResponse.commentary.trim()
                            : "Комментарий от ИИ не получен.";

        const rawScores = (jsonResponse && typeof jsonResponse.scores === 'object') ? jsonResponse.scores : {};

        Object.keys(players).forEach(playerId => {
            const player = players[playerId];
            if (player && player.id) {
                 const score = rawScores[playerId];
                 // Use the schema's enum check implicitly by trusting the model was configured
                 if ([0, 2, 3].includes(score)) {
                     validatedScores[playerId] = score;
                 } else {
                     console.warn(`LLM response score for ${playerId} (${score}) not in [0, 2, 3] or missing. Defaulting to 0.`);
                     validatedScores[playerId] = 0;
                 }
            }
        });

        console.log("LLM Evaluation Scores:", validatedScores);
        if (commentary === "Комментарий от ИИ не получен.") console.warn("LLM did not provide commentary.");

        return { scores: validatedScores, commentary: commentary };

    } catch (error) {
        console.error(`LLM evaluation error for Q[${question['№']}]:`, error);
        // Attempt to parse error details if available
         let errorDetails = error.message;
         if (error.response && error.response.promptFeedback) {
             errorDetails += ` | Feedback: ${JSON.stringify(error.response.promptFeedback)}`;
         }
        console.warn("Falling back to numerical evaluation due to LLM error.");
        return {
            scores: scoringService.evaluateNumerically(question['Ответ'], players),
            commentary: `(Ошибка ИИ: ${errorDetails.substring(0, 100)}...)` // Include brief error info
        };
    }
}

module.exports = {
    initializeLlm,
    isLLMAvailable,
    evaluateWithLLM
};