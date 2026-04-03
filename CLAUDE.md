# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running Locally

```bash
# Python proxy (port 8080)
ANTHROPIC_API_KEY="your_key" python3 server.py

# Node proxy (port 8080)
ANTHROPIC_API_KEY="your_key" node server.js
```

The AI coach requires one of these backends — it cannot call the Anthropic API directly from the browser. Without a backend, the tracker UI still works.

## Deploying the Cloudflare Worker

```bash
cd cloudflare
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
```

After deploying, update `ALLOWED_ORIGINS` in `cloudflare/wrangler.toml` to include your frontend origin.

## Architecture

This is a single-page vanilla JS app with no build step. All files load as ES modules directly from `index.html`.

**Data flow:**
- `storage.js` owns all app state (`state.workouts`, `state.sessions`, `state.prs`) and abstracts over `window.storage` (Claude artifact API) vs `localStorage`
- `app.js` imports `state` from `storage.js` and handles all UI rendering, CRUD, navigation, and PR detection
- `coach.js` imports `state` and `calcStreak` from their respective modules, builds a system prompt from live training data, and POSTs to `/api/coach` (or the URL in `config.js`)

**Coach API URL resolution** (`coach.js`):
- Uses `window.OPERATION_SWOLE_CONFIG.coachApiUrl` from `config.js` if set (for GitHub Pages → Cloudflare Worker)
- Falls back to `/api/coach` (for local proxy servers)

**Cloudflare Worker** (`cloudflare/worker.js`) is a thin proxy: validates `Origin` against `ALLOWED_ORIGINS`, forwards the request body to Anthropic, and returns the response.

## Key Customisation Points

- Add exercises: `DEFAULT_EXERCISES` in `app.js`
- Add/change muscle group tags: `MUSCLE_GROUPS` in `app.js`
- Tune coach personality/prompt: `buildSystemPrompt()` in `coach.js`
- Design tokens (colors, fonts, spacing): top of `style.css`
- Claude model / token limit: `MODEL` and `MAX_TOKENS` constants in `coach.js`
