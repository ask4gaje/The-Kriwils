# The Kriwils — Agent Instruction File

## Project
AI-powered quiz platform (Indonesian). Users generate quizzes via Gemini,
share by 6-char codes, play without accounts.

Stack: Node.js raw http (port 6767), Supabase (auth + DB), Google Gemini.
Frontend: vanilla HTML/CSS/JS, no framework, no bundler. CDN deps only.
Dev dep: nodemon.

Key files: server.js, public/js/{auth,script,quizzes,play}.js,
            public/css/style.css, .env

## RULES

1. NEVER git commit unless explicitly asked. Stage but don't commit.
2. NEVER create .md files unless asked.
3. NEVER add code comments unless asked.
4. Prefer editing existing files over creating new ones, UNLESS creating new ones is the best practice.
5. Match existing code style: no refactoring, no unnecessary abstraction.
6. Every new session: read server.js, auth.js, and style.css first.

## CODE STYLE

7. Write concise, self-documenting code. Meaningful names, no dead code.
8. Always use `===`/`!==`, `const` over `let`, `parseInt(val, 10)`.

## VERIFICATION

9.  Never assume API behavior. Before writing code that depends on a
    third-party response shape (Supabase, Gemini, etc.), either:
    a) Test the actual response via curl or browser console first, or
    b) Ask the user to verify the assumption before implementing.
    Do not guess response field names, error conditions, or edge case
    behavior — ask or test.

## WORKFLOW

10. Before implementing any feature or major change:
   a) Smoke-test existing flow for regressions.
   b) Read every file the change touches.
   c) Trace data flow: client → server → DB → back.
   d) List all files that will change.
   e) Present plan to user before writing code.

11. After implementing: run `node --check <file>` on every modified .js file,
    restart server, and provide a numbered test procedure with expected results.

## COMMITS

Type: lowercase imperative, one line. Bullet body for details.
Types: feat, fix, sec, style, chore, docs

## CONTEXT

- Supabase RLS enabled. SELECT public, modifications owner-only.
- Server uses supabaseAdmin (service role), bypasses RLS.
- Dashboard + score submission go through server API, not direct Supabase.
- escapeHtml() in auth.js available globally. Use for all innerHTML.
- CSS: :root custom properties, breakpoints 768px/640px, Inter font.

## DESIGN SYSTEM

### Tokens — All visual values MUST reference a var(--token). Zero hardcoded anything.

```
--danger-color: #dc2626;   --danger-bg: #fee2e2;    --danger-border: #fecaca;
--success-color: #059669;   --success-bg: #d1fae5;    --success-border: #86efac;
--warning-color: #d97706;   --warning-bg: #fef3c7;    --warning-border: #fcd34d;

--radius-sm: 0.5rem;  --radius-md: 0.75rem;  --radius-lg: 1rem;  --radius-xl: 1.5rem;

--shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
--shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.1);

--space-xs: 0.25rem;  --space-sm: 0.5rem;  --space-md: 0.75rem;  --space-lg: 1rem;
--space-xl: 1.25rem;  --space-2xl: 1.5rem;  --space-3xl: 2rem;  --space-4xl: 2.5rem;

--text-xs: 0.75rem;  --text-sm: 0.8125rem;  --text-base: 0.875rem;
--text-md: 1rem;  --text-lg: 1.125rem;  --text-xl: 1.25rem;
--text-2xl: 1.5rem;  --text-3xl: 1.875rem;  --text-4xl: 2.5rem;
```

### Components
- **Messages**: Use `.message-error`, `.message-success`, `.message-warning` classes. NEVER inline `style="color: #dc2626"`.
- **Buttons**: ONLY 3 variants: default (gradient), `.btn-secondary`, `.btn-danger`.
- **Forms**: Always `<form>` wrapper. Always `autocomplete` attribute. Always `type="submit"` on buttons.
- **Loading**: Every async button MUST show a spinner + text change. Never text-only.
- **Cards**: Use `.auth-card` / `.auth-container` for centered form cards.
- **Password fields**: Always include visibility toggle button.

### Accessibility (mandatory — no exceptions)
- `:focus-visible` ring on ALL interactive elements
- `@media (prefers-reduced-motion)` MUST wrap all animations and transitions
- WCAG AA contrast ≥ 4.5:1 everywhere
- `aria-label` on `<nav>`, `aria-live` on dynamic regions (toasts, timer, questions)

### FORBIDDEN
- NO inline `style="..."` attributes in HTML
- NO page-level `<style>` blocks (all CSS lives in style.css)
- NO `!important` (fix specificity instead)
- NO text-only loading (always spinner + text)
- NO absolute paths (use relative in all HTML/CSS/JS references)
- NO emojis in UI text, markup, or code strings
- NO em dashes (—) in text. Use period or other punctuation.
- NO em-dash in anything

### Breakpoints
- `@media (max-width: 768px)` — tablet adjustments
- `@media (max-width: 640px)` — small phones
