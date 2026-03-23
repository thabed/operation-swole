/**
 * coach.js
 * Manages the AI coaching chat powered by the Anthropic API.
 * Builds a rich system prompt from the user's live training data
 * and maintains conversation history within a session.
 */

import { state } from './storage.js';
import { calcStreak } from './app.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1000;

let chatHistory = [];

/**
 * Builds the system prompt injected into every API call.
 * Summarises the user's workouts, recent sessions, PRs, and streak
 * so Claude can give personalised, data-driven coaching advice.
 */
function buildSystemPrompt() {
  const recent = [...state.sessions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);

  const sessionSummaries = recent.map(s => {
    const vol = (s.exercises || []).reduce((ev, ex) =>
      ev + (ex.sets || []).reduce((sv, set) =>
        sv + (parseFloat(set.weight) || 0) * (parseFloat(set.reps) || 0), 0), 0);
    const note = s.notes ? `. Note: ${s.notes}` : '';
    return `- ${new Date(s.date).toLocaleDateString()}: ${s.workoutName} ` +
           `(${(s.exercises || []).length} exercises, ${Math.round(vol)}kg volume)${note}`;
  });

  const prSummary = Object.entries(state.prs)
    .slice(0, 15)
    .map(([name, pr]) => `${name}: ${pr.weight}kg × ${pr.reps}`)
    .join(', ');

  return `You are a professional strength and conditioning coach. You have full access to the user's training history below. Be motivating, specific, and data-driven. Keep answers concise but insightful. Use the data to personalise every response — reference actual numbers, trends, and achievements.

User stats:
- Total sessions logged: ${state.sessions.length}
- Current training streak: ${calcStreak()} days
- Workouts built: ${state.workouts.map(w => w.name).join(', ') || 'none yet'}
- Personal records: ${prSummary || 'none recorded yet'}

Recent sessions (last 10):
${sessionSummaries.join('\n') || 'No sessions logged yet.'}`;
}

/**
 * Sends a user message to the API and streams the reply into the chat UI.
 * @param {string} text - The user's message
 * @param {Function} onReply - Callback receiving the assistant's reply string
 * @param {Function} onError - Callback receiving an error message string
 */
export async function sendCoachMessage(text, onReply, onError) {
  chatHistory.push({ role: 'user', content: text });

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        messages: chatHistory,
      }),
    });

    const data = await res.json();
    const reply = data.content?.find(c => c.type === 'text')?.text
      || 'Sorry, I had trouble responding — please try again.';

    chatHistory.push({ role: 'assistant', content: reply });
    onReply(reply);
  } catch (e) {
    console.error('Coach API error:', e);
    onError('Connection error. Please check your network and try again.');
  }
}

/** Clears conversation history (e.g. on page reload or manual reset). */
export function clearChatHistory() {
  chatHistory = [];
}
