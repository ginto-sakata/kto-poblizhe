# === 🎮 Кто Поближе? - Веб-Версия 🍋 ===

Здарова! 👋 Это репозиторий мультиплеерной викторины ([оригинал](https://dialogs.yandex.ru/store/skills/06a89705-igra-kto-blizhe)) "Кто Поближе?". Классика для <del>мф</del>посиделок с друзьями, теперь в онлайне! Суть проста: ведущий задаёт вопрос, на который нужно дать числовой ответ. Побеждает тот, кто окажется *ближе* всех к правильному значению. Немного эрудиции, щепотка интуиции и удача – вот рецепт победы! 🏆

---

## === 💻 Стек Технологий ===

*   **Бэкенд:** Node.js 🟢, Express 🚀, Socket.IO 🔌 (для реалтайма)
*   **Фронтенд:** HTML, Tailwind CSS 💨 (для стилей), Vanilla JavaScript (ES6+)
*   **Оценка AI (Опционально):** Google Gemini API ✨
*   **База вопросов:** CSV 📄
*   **База игроков/статистики:** JSON 📄
*   **Тесты:** Jest 🧪
*   **Сборка CSS:** Tailwind CLI
*   **Параллельный запуск:** concurrently

---

## === 🛠️ Установка и Настройка ===

1.  **📥 Клонируй repo:**
    ```bash
    git clone https://github.com/ginto-sakata/kto-poblizhe
    cd kto-poblizhe
    ```
2.  **🔧 Установи зависимости:**
    ```bash
    npm install
    ```
3.  **⚙️ Настрой окружение:**
    *   Скопируй файл `.env.example` в `.env`.
    *   Открой `.env` и вставь свой ключ для `GEMINI_API_KEY=ТВОЙ_КЛЮЧ_ТУТ`. Если ключа нет или не хочешь юзать AI, оставь пустым (фичи с AI будут недоступны).
    *   (Опционально) Поменяй `PORT`, если стандартный 3000 занят.

---

## === 🔥 Запуск для Разработки ===

Этот режим – для кодинга, тут и сервер поднимется, и Tailwind будет сам обновлять стили при изменениях в `html`/`js`/`css`.

```bash
npm run dev
```

Сервер запустится (обычно на `http://localhost:3000`), и Tailwind начнет следить за файлами. Консоль покажет логи сервера и сборщика стилей.

---

## === ⚙️ Запуск в "Продакшене" (Типа) ===

Если нужно просто запустить игру без авто-обновления стилей:

1.  **✨ Собери стили один раз:**
    ```bash
    npm run build
    ```
2.  **🚀 Запусти сервер:**
    ```bash
    npm start
    ```

---

## === 🧪 Запуск Тестов ===

Для прогона всех тестов (юнит + интеграционные):

```bash
npm test
```

Чтобы запустить тесты только для конкретного файла:

```bash
npm test -- __tests__/llmService.integration.test.js
```
*(Не забудь `--` перед путём к файлу)*

---

## === 📁 Структура Проекта (Вкратце) ===

*   `server.js`: Главный файл бэкенда, старт сервера.
*   `*.js` (в корне): Модули бэкенда (логика игры, обработчики сокетов, работа с данными/AI).
*   `data/`: Тут лежат `game.csv` (вопросы) и `players.json` (статистика).
*   `prompts/`: Текстовые шаблоны для промптов к AI.
*   `public/`: Статика фронтенда (HTML, CSS, JS клиента, картинки).
    *   `client.js`: Основная логика клиента.
    *   `uiUpdater.js`: Функции для обновления разных частей UI.
    *   `playerPanel.js`/`rightJoinPanel.js`: Генераторы HTML для панелей.
    *   `avatar.js`: Генерация SVG аватаров.
    *   `style.css`: Скомпилированные Tailwind стили.
*   `src/`: Исходники для Tailwind CSS.
*   `__tests__/`: Юнит и интеграционные тесты Jest.
*   `.vscode/`: Настройки VS Code для запуска и задач (включая автозапуск Tailwind watch).
*   `package.json`, `package-lock.json`: Управление зависимостями Node.js.
*   `.env`: Секретные ключи и настройки (НЕ коммитить в Git!).
*   `tailwind.config.js`: Конфиг Tailwind CSS.

---

Вроде всё! Залетай, кодь, играй! 😎 Если что – спрашивай. Удачи! 🚀
