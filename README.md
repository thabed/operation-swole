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

Because the app uses ES modules, you need a local server (browsers block `import` over `file://`).

```bash
# Option 1 — Python (no install needed)
python3 -m http.server 8080

# Option 2 — Node
npx serve .

# Option 3 — VS Code
# Install the "Live Server" extension and click "Go Live"
```

Then open [http://localhost:8080](http://localhost:8080).

### Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set source to **Deploy from a branch** → `main` → `/ (root)`
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`

## Storage

Data persists via `window.storage` when running inside Claude.ai artifacts, and falls back to `localStorage` for standalone use. No backend or account required.

## AI Coach

The coach uses the Anthropic API (`claude-sonnet-4-20250514`) and builds a system prompt from your live training data before every message — so advice is always personalised to your actual performance.

When running inside Claude.ai, the API key is handled automatically. For standalone use outside Claude.ai, you will need to proxy API requests through your own backend (browser environments cannot safely hold API keys).

## Customisation

- Add exercises to `DEFAULT_EXERCISES` in `app.js`
- Adjust muscle group tags in `MUSCLE_GROUPS` in `app.js`
- Tweak the coach personality in the `buildSystemPrompt()` function in `coach.js`
- Design tokens (colours, fonts, spacing) live at the top of `style.css`
