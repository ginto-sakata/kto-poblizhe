require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3000;
const morgan = require('morgan'); // HTTP request logger

// Middleware
app.use(express.json());
app.use(morgan('dev')); // Log HTTP requests

// Initialize Google Gen AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// JSON Schema for response
const jsonSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "scores": {
      "type": "object",
      "additionalProperties": {
        "type": "integer",
        "enum": [0, 2, 3]
      }
    },
    "commentary": {
      "type": "string"
    }
  },
  "required": ["scores", "commentary"]
};

// Properly structured dummy data
const dummyData = {
  receivedQuestion: {
    "Вопрос": "В каком году был основан Google?",
    "Ответ": "1998"
  },
  playerAnswers: [
    { playerId: "user123", answer: "1998" },
    { playerId: "user456", answer: "2000" },
    { playerId: "user789", answer: "1985" },
    { playerId: "user101", answer: "1995" }
  ]
};

// Function to generate player answers string
function generatePlayerAnswersString(answers) {
  if (!answers || !Array.isArray(answers)) {
    throw new Error("Invalid answers format - expected an array");
  }
  return answers.map(a => `- ${a.playerId}: "${a.answer}"`).join('\n');
}

// API endpoint
app.post('/evaluate-answers', async (req, res) => {
  try {
    // Use request body if available, otherwise use dummy data
    const data = req.body && Object.keys(req.body).length ? req.body : dummyData;
    
    // Validate data structure
    if (!data.receivedQuestion || !data.playerAnswers) {
      throw new Error("Invalid data structure - missing required fields");
    }

    const playerAnswersString = generatePlayerAnswersString(data.playerAnswers);
    const jsonSchemaString = JSON.stringify(jsonSchema, null, 2);

    const prompt = `
Ты — харизматичный и остроумный ведущий викторины "Кто Поближе?", способный шутить, удивляться редким фактам и подшучивать над игроками за промахи. Твоя задача — оценить ответы игроков и дать яркий, живой комментарий на русском языке, используя предоставленную JSON-схему.

Вопрос: **"${data.receivedQuestion['Вопрос']}"**
Правильный ответ: **"${data.receivedQuestion['Ответ']}"**

Ответы игроков для оценки:
${playerAnswersString}

### Правила оценки (ключ "scores")
- Оценка ставится каждому игроку (ID игрока: оценка).
- Оценка может быть: 0 (неверно), 2 (близко), 3 (точно).
- "Близко" определяется твоим здравым смыслом, но старайся быть последовательным. Точное попадание - всегда 3. Очень далекие ответы - 0.

### Формат ответа (JSON)
Ты _должен_ вернуть ТОЛЬКО валидный JSON, соответствующий предоставленной схеме:
\`\`\`json
${jsonSchemaString}
\`\`\`
Никакого лишнего текста до или после JSON.

### Примеры шаблонов для комментария ("commentary") - используй пободные комментарии:
- 🎉 "Ух ты! [имя_игрока] попал в десятку! Хотя, признаемся, вопрос был лёгкий..."
- 🤯 "Что?! [имя_игрока] серьёзно написал **это**? Теперь мне страшно..."
- 📚 "А вы знали, что [Вставь сюда интересный факт по теме вопроса]."
- 🧐 "Ближе всех [имя_игрока]! Красава"
- 😂 "Ну типа... нет. Но хотя я бы хотел жить в мире, где это правда!"

Возвращай JSON, соответствующий предоставленной схеме.`;

    // Get the generative model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    // Generate content
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const responseText = result.response.text();
    
    // Try to parse the JSON response
    try {
      const jsonResponse = JSON.parse(responseText);
      res.json(jsonResponse);
    } catch (e) {
      // If parsing fails, try to extract JSON from markdown code block
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        res.json(JSON.parse(jsonMatch[1]));
      } else {
        throw new Error("Invalid JSON response from model");
      }
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error.message 
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});