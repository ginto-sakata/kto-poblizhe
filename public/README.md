# Кто Поближет - Web Version

A simple web-based multiplayer trivia game where players guess numbers or dates, and the closest answer wins points.

## Prerequisites

*   **Node.js and npm:** Install from [nodejs.org](https://nodejs.org/).
*   **Google Gemini API Key (Optional):** Needed only for AI answer evaluation. Get from [Google AI Studio](https://aistudio.google.com/app/apikey).

## Installation

1.  **Get the code:** Clone the repository or download the files.
    ```bash
    # Example using git:
    git clone <repository-url>
    cd kto-poblizhet-web
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Create `.env` file:** Create a file named `.env` in the main project folder with this content:
    ```dotenv
    PORT=3000
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE # Optional: Add your key here or leave blank
    ```
4.  **Questions:** Make sure `data/game.csv` exists with your trivia questions.

## How to Run

1.  **Start the server:**
    ```bash
    node server.js
    ```
2.  **Open the game:** Go to `http://localhost:3000` in your web browser.
3.  **Play:** Enter a name, join, and the host can start the game!

---