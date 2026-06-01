# UI/UX Testing Guide — The Kriwils

Run the server (`node server.js` or `pm2 start server.js --interpreter node`) and visit `http://localhost:6767`.

---

## 1. Design Tokens (Group 1)

| # | Test | Expected |
|---|------|----------|
| 1.1 | Open `css/style.css` in browser inspector. Check `:root` on `<html>`. | 38 CSS variables present: `--danger-color`, `--success-color`, `--warning-color`, `--radius-sm/md/lg/xl`, `--shadow-sm/md/lg/xl`, `--space-xs` through `--space-4xl`, `--text-xs` through `--text-4xl`. |
| 1.2 | Inspect a button, check computed styles. | Background should be `linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)`. No `ring` property anywhere (was previously broken). |

## 2. Focus States (Group 1)

| # | Test | Expected |
|---|------|----------|
| 2.1 | Press Tab on `/login.html`. | Each input and button shows a visible purple outline ring. |
| 2.2 | Tab to the "Forgot password?" link. | Link gets a purple outline with 2px offset. |
| 2.3 | Press Tab on `/play.html`. | All buttons show focus ring. |
| 2.4 | Open OS accessibility settings, enable "Reduce motion." Reload `/play.html`. | No animations play (spinner stops, card slides don't animate, toast slides in instantly). |

## 3. Message Banners (Group 1, 2)

| # | Test | Expected |
|---|------|----------|
| 3.1 | On `/login.html`, submit with empty fields. | Red error banner: `"Please fill in all fields."` Has `message-error` class (red text, light red background, border). |
| 3.2 | On `/register.html`, submit with email already registered. | Red error banner with Supabase error message. |
| 3.3 | On `/register.html`, create a new account with email confirmation enabled. | Amber warning banner: `"A confirmation email has been sent. You must verify your email before signing in."` |
| 3.4 | On `/resetpassword.html`, enter a non-existent email, submit. | Red error: `"No account found with that email address."` |
| 3.5 | On `/resetpassword.html`, enter an existing email, submit. | Green success: `"Reset link sent! Check your inbox."` |

## 4. Password Visibility Toggle (Group 2)

| # | Test | Expected |
|---|------|----------|
| 4.1 | On `/login.html`, click "Show" button in the password field. | Dots change to readable text. Button text changes to "Hide". |
| 4.2 | Click "Hide". | Text reverts to dots. Button text reverts to "Show". |
| 4.3 | Repeat on `/register.html` password field. | Same behavior. |
| 4.4 | Repeat on `/updatepassword.html` both fields. | Each toggle operates independently. |

## 5. Autocomplete Attributes (Group 2)

| # | Test | Expected |
|---|------|----------|
| 5.1 | Open DevTools, inspect email field on `/login.html`. | `autocomplete="email"` present. |
| 5.2 | Inspect password field on `/login.html`. | `autocomplete="current-password"` present. |
| 5.3 | Inspect email on `/register.html`. | `autocomplete="email"`. |
| 5.4 | Inspect display name on `/register.html`. | `autocomplete="name"`. |
| 5.5 | Inspect password on `/register.html`. | `autocomplete="new-password"`. |
| 5.6 | Inspect both passwords on `/updatepassword.html`. | Both `autocomplete="new-password"`. |
| 5.7 | Inspect delete confirm on `/account.html`. | `autocomplete="off"`. |

## 6. Enter Key Support (Group 2)

| # | Test | Expected |
|---|------|----------|
| 6.1 | On `/login.html`, fill email and password, press Enter. | Login fires (same as clicking "Sign In"). |
| 6.2 | On `/register.html`, fill fields, press Enter. | Registration fires. |
| 6.3 | On `/resetpassword.html`, fill email, press Enter. | Reset email sends. |
| 6.4 | On `/updatepassword.html`, fill both passwords, press Enter. | Password updates. |
| 6.5 | On `/account.html`, fill DELETE confirmation, press Enter. | Delete fires. |
| 6.6 | On `/play.html`, enter name, press Enter. | Quiz starts (name prompt). |

## 7. Nav Bar Path Detection (Group 4)

| # | Test | Expected |
|---|------|----------|
| 7.1 | Visit `/play/KRIWIL`. | "Play" in nav should be highlighted as active. |
| 7.2 | Visit `/play/KRIWIL/` (trailing slash). | Nav works, no crash. No incorrect active state. |
| 7.3 | Logged in, visit `/account.html`. | "Account" in nav highlighted. |
| 7.4 | Logged out. | Nav shows only: Play, About, Login. |
| 7.5 | Logged in. | Nav shows: Create, Play, Quiz, About, Account, Logout. |

## 8. Play Page (Group 1, 5)

| # | Test | Expected |
|---|------|----------|
| 8.1 | Open `/play.html` directly (no code). | Loading spinner appears, then Supabase error (404). No broken styles. |
| 8.2 | Visit `/play/VALID_CODE` with an existing quiz. | Name prompt appears. "Ready to Play?" heading, input, "Start Quiz" button. No inline styles in DevTools. |
| 8.3 | Enter name, click Start Quiz. | Quiz begins. Progress bar, question text, option buttons visible. Option buttons styled with proper hover (slide-right effect). |
| 8.4 | Answer all questions. | Results screen appears. Score circle, feedback text, action buttons. "Review Answers" button visible. |
| 8.5 | Click "Review Answers". | Review list appears. Answer boxes colored green (correct) or red (wrong). No `!important` in option button styles. |
| 8.6 | Click "Back to Results" from review. | Returns to results screen. |
| 8.7 | Click "Try Again". | Page reloads, quiz restarts from name prompt. |
| 8.8 | Click "Back to Home". | Redirects to `index.html`. |
| 8.9 | Resize browser to 375px width. | Quiz container padding shrinks. Text stays readable. Buttons don't overflow. Toast notifications shrink to fit. |

## 9. No Inline Styles (Group 5)

| # | Test | Expected |
|---|------|----------|
| 9.1 | Open DevTools, search all pages for `style="`. | Zero matches in any HTML file. |
| 9.2 | Check that dynamically-generated links ("Resend confirmation email", etc.) use CSS classes. | `class="inline-link"` instead of `style="color: ..."`. |

## 10. Account Page (Group 2, 5)

| # | Test | Expected |
|---|------|----------|
| 10.1 | Visit `/account.html` while logged in. | Email address shown in gray display box. "Send Password Reset Email" button visible. |
| 10.2 | Click "Send Password Reset Email". | Green success: "Reset link sent! Check your inbox." |
| 10.3 | Type wrong text in DELETE field, click Delete. | Red error: "Please type DELETE to confirm." |
| 10.4 | Type "DELETE", click Delete Account. | Account deleted, redirected to login. |
| 10.5 | Inspect headings and elements. | No inline `style="..."` attributes present. |

## 11. Join Page (Group 3)

| # | Test | Expected |
|---|------|----------|
| 11.1 | Visit `/join.html`. | Hero grid with two cards. Quiz code input centered, large font, monospace. "Host a Quiz" card has dashed border. |
| 11.2 | Type a 5-character code, press Enter. | Error toast: "Please enter a valid 6-character code!" |
| 11.3 | Type a 6-character code, press Enter. | Redirects to `/play/CODE`. |
| 11.4 | Log in, revisit `/join.html`. | Host card hidden. Only play card visible. |
| 11.5 | Inspect elements. | No inline `style="..."` attributes. Feature list uses `.host-feature-list`. Label uses `.join-input-label`. |

## 12. Index Page (Group 3)

| # | Test | Expected |
|---|------|----------|
| 12.1 | Visit `/index.html` while logged in. | Quiz generator form visible. All dropdowns, checkbox, file upload present. |
| 12.2 | Inspect file upload helper text. | Uses `.form-hint` class. No inline style. |
| 12.3 | Inspect quiz results container. | `display: none` applied via `.quiz-results` CSS class, not inline. |

## 13. About Page (Group 4)

| # | Test | Expected |
|---|------|----------|
| 13.1 | Visit `/about.html`. | Heading, description paragraph, "How it Works" section with 3 step cards (numbered circles). |
| 13.2 | Check DevTools for loaded scripts. | Only `auth.js` loaded. `script.js` no longer loaded on this page. |

## 14. Quizzes Page (Group 3, 5)

| # | Test | Expected |
|---|------|----------|
| 14.1 | Visit `/quizzes.html` while logged in. | Loading spinner appears, then quiz cards load. |
| 14.2 | Click "Stats" on a quiz card. | Modal opens. No inline styles on modal elements. |
| 14.3 | Click "Edit" on a quiz card. | Edit modal opens with wider max-width (800px). Save button styled via `.save-btn` class. |
| 14.4 | Close modals. | Modals hide properly. |

## 15. Responsive Design (Group 4)

| # | Test | Expected |
|---|------|----------|
| 15.1 | Open `/login.html` at 375px viewport width. | Card padding reduced to `1.5rem`. Form still fits on screen. |
| 15.2 | Open any page at 375px. | `h1` heading scales to `1.875rem` instead of `2.5rem`. |
| 15.3 | Trigger a toast on mobile (e.g., error on login). | Toast max-width is `100vw - 2rem`. Fits on screen. |
| 15.4 | Open `/join.html` at 375px. | Hero cards stack vertically (single column). |
| 15.5 | Open `/join.html` at 375px. | Steps grid stacks vertically (single column). |

## 16. Screen Reader Support (Group 4)

| # | Test | Expected |
|---|------|----------|
| 16.1 | Trigger any toast notification. Inspect `#toast-container`. | `aria-live="polite"` attribute present on container. |
| 16.2 | Open Firefox Accessibility Inspector. | Toast container is a live region. New toasts announced. |

## 17. API Endpoint (Prior Work)

| # | Test | Expected |
|---|------|----------|
| 17.1 | `POST /api/send-reset-email` with `{"email":"nonexistent@test12345.com"}`. | HTTP 404, `{"error":"No account found with that email address."}` |
| 17.2 | `POST /api/send-reset-email` with `{"email":""}`. | HTTP 400, `{"error":"Email is required."}` |
| 17.3 | `POST /api/send-reset-email` with an existing email. | HTTP 200, `{"success":true}`. Reset email sent to inbox. |
