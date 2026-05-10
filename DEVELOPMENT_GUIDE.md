# Development Workflow: Nodemon vs. PM2

This guide explains the industry standard for running Node.js applications during development (writing code) versus production (live to users).

## 1. The Development Phase (`nodemon`)

When you are actively writing code, you want the server to restart automatically every time you press "Save".

**The Tool:** `nodemon` (Node Monitor). It watches your files for changes and restarts the `node` process instantly.

### How to use it:
1. Open your terminal in the project folder.
2. Ensure you have no PM2 processes running in the background for this project (`pm2 stop all`).
3. Run the development script:
   ```bash
   npm run dev
   ```
4. *Leave this terminal open*. As you edit `server.js`, you will see nodemon output `[nodemon] restarting due to changes...`.

**Best Practice:** Only use `nodemon` on your local laptop. Never use it on your cloud VM.

---

## 2. The Production Phase (`pm2`)

When you are done coding and want the site to be "live", you need a tool that keeps the server running in the background, restarts it if it crashes, and starts it automatically when the computer reboots.

**The Tool:** `pm2` (Process Manager 2).

### How to use it:
1. When you are finished developing, go to the terminal running `nodemon` and press `Ctrl + C` to stop it.
2. Start the production process:
   ```bash
   npm run prod:start
   ```
3. You can now safely close the terminal. The server is running in the background.

### Updating Code in Production
If your server is already running via PM2 and you pull new code from GitHub (e.g., on your VM), do **not** restart the whole process if you can avoid it. Use `reload` instead for zero-downtime deployments:
```bash
npm run prod:reload
```
*(Reload smoothly stops old connections and starts new ones. Restart brutally kills the process).*

## Summary
* **Local Laptop (Coding):** `npm run dev` (Terminal stays open, auto-restarts).
* **Local Laptop (Done Coding / Testing Background):** `npm run prod:start` (Terminal can close).
* **Cloud VM (Live):** `npm run prod:start` (Always).
