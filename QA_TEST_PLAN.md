# QA Test Plan: dev/Play_Default Branch

This document outlines the testing protocol to verify the architectural upgrades, security features, and UI enhancements introduced in the `dev/Play_Default` branch.

---

- [ ] ***Phase 1: Routing & Dynamic Navigation***
**Goal:** Verify that the website handles logged-in vs. guest users correctly.

1. **Guest Landing Page**:
    * Open an incognito window or ensure you are logged out.
    * Navigate to <http://localhost:6767/>
    * **Expected Result**: You should land on the "Join a Quiz" page (`join.html`). The navigation bar should only show **"Play"**, **"About"**, and **"Login"** (styled as a green button).
2. **Protected Routes**:
    * While still logged out, attempt to manually visit <http://localhost:6767/index.html> (Create) and <http://localhost:6767/quizzes.html> (Dashboard).
    * **Expected Result**: You should be instantly redirected to the `login.html` page.
3. **Logged-In Navigation**:
    * Log in to the application.
    * **Expected Result**: The navigation bar should expand to show **"Create"**, **"Play"**, **"Quiz"**, **"About"**, and **"Logout"**.

---

- [ ] ***Phase 2: The "Join" Landing Page (Dual-Path Hero)***
**Goal:** Verify the new layout and intelligent redirection on `join.html`.

1. **Guest "Host" Click**:
    * Log out and navigate to `join.html`.
    * Click the **"Start Creating →"** button on the right-side "Host a Quiz" card.
    * **Expected Result**: You are redirected to `login.html`.
2. **Logged-In View**:
    * Log in and navigate back to `join.html`.
    * **Expected Result**: The "Host a Quiz" card should dynamically disappear. The "Play a Quiz" card should be perfectly centered in the middle of the screen.

---

- [ ] ***Phase 3: Server-Side Background Generation***
**Goal:** Verify that quizzes generate safely in the background and persist across page loads.

1. **The Pre-Check & Auto-Scroll**:
    * Go to the **Create** page (`index.html`). Fill out a topic (e.g., "History of Rome") and click "Generate".
    * **Expected Result**: The page should smoothly auto-scroll down. You should briefly see "Initializing background generation...", which then turns into the green "Background Generation Started" success box.
2. **Navigation Independence (State Persistence)**:
    * Start generating another quiz.
    * *Immediately* click on the **"About"** page in the navigation bar. Wait 5 seconds.
    * Click back to the **"Create"** page.
    * **Expected Result**: The page should remember a generation is in progress. It should automatically block the form and show the loading spinner/success box polling for status.
3. **Live Dashboard Tracking**:
    * Start generating a quiz and immediately click **"Quiz"** to go to your dashboard (`quizzes.html`).
    * **Expected Result**: You should see a dashed card at the top of your list saying "⏳ Generating: [Topic]".
    * Do not refresh the page. Wait for completion.
    * **Expected Result**: The generating card should automatically transform into a normal, playable quiz card once the server finishes.

---

- [ ] ***Phase 4: Error Handling & Edge Cases***
**Goal:** Ensure the application degrades gracefully and prevents abuse.

1. **Invalid Quiz Code**:
    * Go to the "Play" page using a fake code (e.g., <http://localhost:6767/play/FAKEEE>).
    * **Expected Result**: Instead of plain red text, you should see a large, centered card with a 🤔 emoji saying **"Oops! Quiz Not Found"** and a "Try Another Code" button.
2. **Simultaneous Generation Blocker**:
    * Start generating a quiz.
    * While it's spinning, open a **new tab** to the Create page and try to generate a second quiz.
    * **Expected Result**: The server should reject the request, and the UI should display a red toast saying *"Please wait for your current quiz to finish generating!"*
3. **Auto-Cleanup (Simulate Failure)**:
    * *(Advanced)*: Temporarily invalidate your `.env` file (e.g., change `GEMINI_API_KEY` to `FAKE_KEY`). Run `pm2 restart all`. Try to generate a quiz.
    * **Expected Result**: The AI pre-check should catch the failure instantly and display an error toast (e.g., "Gemini AI is currently busy or unreachable"). No ghost quizzes should remain in the database.
    * *(Remember to restore the correct key and restart PM2 afterwards).*

---

- [ ] ***Phase 5: UI Polish***
**Goal:** Verify smaller visual consistency tweaks.

1. **Quiz Code Visibility**:
    * Navigate to the **"Quiz"** dashboard.
    * **Expected Result**: Underneath the "Topic" line for every quiz, the raw 6-character code (e.g., `Code: KRIWIL`) should be visible and styled seamlessly to match the surrounding metadata text.
