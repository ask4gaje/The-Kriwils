# Technical Code Explanation: The Kriwils

This document provides a technical deep-dive into the logic and functions of the project.

---

## 1. Backend: `server.js` (Node.js)
The server uses the built-in `http` module. It is a **Static File Server** with a custom **Router**.

### **Key Logic: Pretty URL Rewriting**
To support links like `/play/ABC123`, the server checks if the incoming request starts with `/play/`.
```javascript
if (urlPath.startsWith('/play/')) {
    const filePath = path.join(PUBLIC_DIR, 'play.html');
    // Serves play.html regardless of the code after /play/
}
```
This allows the frontend JavaScript in `play.js` to extract the code from the URL and fetch the correct quiz from Supabase.

---

## 2. Frontend: `js/auth.js` (Security & Feedback)
This file is the "Authentication Library" for the project.

### **Functions:**
*   `registerUser` / `loginUser`: Converts a username into an internal email format (`username@thekriwils.local`) to satisfy Supabase's email-based auth requirement while keeping the UI simple for users.
*   `showToast(message, type)`: A dynamic UI utility. It calculates the `fontSize` based on the string length and appends a temporary DOM element to the body.

---

## 3. Frontend: `js/script.js` (AI & PDFs)
Handles the "Generation" phase of the app.

### **Key Logic: PDF Extraction**
Uses `pdf.js` to iterate through pages, extract text content, and join them into a single context string.
```javascript
for (let i = 1; i <= pagesToRead; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // ... joins strings
}
```

### **Key Logic: AI Retry & Fallback**
The `askGeminiWithRetry` function handles network flakiness or API limits by using a `for` loop and `setTimeout` for exponential backoff. It uses **Gemini 2.0 Flash** for cost-efficiency.

---

## 4. Frontend: `js/quizzes.js` (Management)
Handles the "Dashboard" logic.

### **Functions:**
*   `loadMyQuizzes`: Queries the `quizzes` table filtered by the current user's `creator_id`.
*   `saveQuizEdits`: Collects data from dynamically generated inputs in the Edit Modal and performs a `.update()` query in Supabase.
*   `showStats`: Aggregates player results. It toggles between a "Top 5" view (ordered by score) and an "All" view (ordered by date).

---

## 5. Frontend: `js/play.js` (The Game Engine)
Manages the state of a live quiz.

### **Logic Flow:**
1.  **Initialization**: Checks for a `short_code` in the URL path or a `quiz_id` in the query params.
2.  **State Management**: Tracks `currentIndex` (current question) and `userAnswers` (for the final review).
3.  **Persistence**: 
    *   Uses `localStorage` to remember the player's name across sessions.
    *   Saves only the **highest score** to the database for each player to prevent leaderboard spam.
4.  **Feedback**: Uses the `canvas-confetti` library for celebrations on 100% scores.

---
*Technical Documentation for Developers.*
