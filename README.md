# Operation Swole 💪

A gym performance tracker with an AI coaching layer powered by Claude.

## Features

- **Workout Builder** — Create and manage custom training routines with exercises, sets, reps, and muscle group tags
- **Session Logger** — Log each workout in real time, mark completed sets, and track weight/reps per exercise
- **PR Detection** — Automatically detects and records personal records as you log sessions
- **Progress Dashboard** — Volume chart over time, PR leaderboard, activity heatmap, and streak counter
- **AI Coach** — Chat with Claude, which has full context of your training history, PRs, and patterns

## Project Structure

```
operation-swole/
├── index.html     # App shell and all HTML views
├── style.css      # All styles and design tokens
├── app.js         # Core logic: navigation, rendering, CRUD, chart
├── coach.js       # AI coach: Anthropic API calls and system prompt
├── storage.js     # Persistence layer (window.storage / localStorage)
└── README.md
```

## Getting Started

### Run locally

If you want the full app, including the AI coach, run one of the included local proxy servers. Static servers such as Python's `http.server`, `npx serve`, or Live Server can load the UI, but the coach will not work because it needs a backend proxy for Anthropic.

```bash
# PowerShell
$env:ANTHROPIC_API_KEY="your_api_key_here"
py server.py

# macOS / Linux
ANTHROPIC_API_KEY="your_api_key_here" python3 server.py
```

Then open [http://127.0.0.1:8080](http://127.0.0.1:8080).

If you only want to use the tracker UI without the AI coach, you can still use any static server.

If you prefer Node instead, you can also run `node server.js` with the same `ANTHROPIC_API_KEY` environment variable.

### Deploy AI Coach for GitHub Pages

GitHub Pages can host the frontend, but the AI coach still needs a separate backend. This repo includes a Cloudflare Worker for that backend in `cloudflare/worker.js`.

This repo also includes GitHub Actions workflows that can deploy both the frontend and the Worker automatically.

1. Add these GitHub repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
ANTHROPIC_API_KEY
```

For `CLOUDFLARE_API_TOKEN`, create a token with at least these permissions:

```text
Account:Cloudflare Workers Scripts:Edit
Zone:Workers Routes:Edit
Account:Account Settings:Read
```

If you deploy only to `workers.dev` and not to a custom domain route, the critical permission is `Account:Cloudflare Workers Scripts:Edit`.

2. Add this GitHub repository variable:

```text
COACH_API_URL=https://operation-swole-coach.your-subdomain.workers.dev/api/coach
```

3. Push to `main` and let these workflows run:

```text
.github/workflows/deploy-pages.yml
.github/workflows/deploy-worker.yml
```

4. If you prefer to deploy the Worker manually instead of through GitHub Actions, install Wrangler:

```bash
npm install -g wrangler
```

5. Log in to Cloudflare:

```bash
wrangler login
```

6. Deploy the worker from the `cloudflare` directory:

```bash
cd cloudflare
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
```

7. In the Cloudflare Worker settings, set `ALLOWED_ORIGINS` to include your GitHub Pages origin, for example:

```text
https://thabed.github.io,http://127.0.0.1:8080,http://localhost:8080
```

8. If you are not using the GitHub Actions Pages workflow, edit `config.js` in the repo root and set `coachApiUrl` to your Worker endpoint, for example:

```js
window.OPERATION_SWOLE_CONFIG = {
	coachApiUrl: 'https://operation-swole-coach.your-subdomain.workers.dev/api/coach',
};
```

9. Push the repo to GitHub.

After that, the GitHub Pages site will send coach requests to the Worker, and the Worker will forward them to Anthropic.

### Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set source to **GitHub Actions**
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`

## Storage

Data persists via `window.storage` when running inside Claude.ai artifacts, and falls back to `localStorage` for standalone use. No backend or account required.

## AI Coach

The coach uses the Anthropic API (`claude-sonnet-4-20250514`) and builds a system prompt from your live training data before every message — so advice is always personalised to your actual performance.

For standalone use outside Claude.ai, this repo includes simple local proxies in `server.py` and `server.js`, plus a deployable Cloudflare Worker in `cloudflare/worker.js`. Set `ANTHROPIC_API_KEY` on whichever backend you run. Browser environments cannot safely hold API keys directly.

If you deploy the static frontend to GitHub Pages, point `config.js` at your hosted backend URL so the frontend can call the Worker instead of `/api/coach` on the same origin.

## Customisation

- Add exercises to `DEFAULT_EXERCISES` in `app.js`
- Adjust muscle group tags in `MUSCLE_GROUPS` in `app.js`
- Tweak the coach personality in the `buildSystemPrompt()` function in `coach.js`
- Design tokens (colours, fonts, spacing) live at the top of `style.css`
