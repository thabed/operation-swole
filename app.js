/**
 * app.js
 * Core application logic for Operation Swole.
 * Handles navigation, rendering all views, workout/session CRUD,
 * PR detection, and the progress chart.
 */

import { state, loadState, saveState } from './storage.js';
import { sendCoachMessage } from './coach.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];

export const DEFAULT_EXERCISES = [
  { name: 'Bench Press',           muscles: 'Chest',     defaultSets: 4, defaultReps: '6-8'   },
  { name: 'Squat',                 muscles: 'Legs',      defaultSets: 4, defaultReps: '5'      },
  { name: 'Deadlift',              muscles: 'Back',      defaultSets: 3, defaultReps: '5'      },
  { name: 'Overhead Press',        muscles: 'Shoulders', defaultSets: 3, defaultReps: '8'      },
  { name: 'Pull-Up',               muscles: 'Back',      defaultSets: 3, defaultReps: '8-10'   },
  { name: 'Row',                   muscles: 'Back',      defaultSets: 3, defaultReps: '10'     },
  { name: 'Incline Dumbbell Press',muscles: 'Chest',     defaultSets: 3, defaultReps: '10-12'  },
  { name: 'Romanian Deadlift',     muscles: 'Legs',      defaultSets: 3, defaultReps: '10'     },
  { name: 'Lateral Raise',         muscles: 'Shoulders', defaultSets: 3, defaultReps: '15'     },
  { name: 'Curl',                  muscles: 'Arms',      defaultSets: 3, defaultReps: '12'     },
  { name: 'Tricep Pushdown',       muscles: 'Arms',      defaultSets: 3, defaultReps: '12'     },
  { name: 'Plank',                 muscles: 'Core',      defaultSets: 3, defaultReps: '60s'    },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let editingWorkoutId = null;
let exerciseCount = 0;
let chartInstance = null;

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');

  if (name === 'dashboard') renderDashboard();
  if (name === 'progress')  renderProgress();
}

// ---------------------------------------------------------------------------
// Streak helpers
// ---------------------------------------------------------------------------

export function calcStreak() {
  if (!state.sessions.length) return 0;
  const dates = [...new Set(state.sessions.map(s => s.date.split('T')[0]))]
    .sort()
    .reverse();
  let streak = 0;
  let prev = new Date();
  for (const d of dates) {
    const diff = Math.round((prev - new Date(d)) / 86400000);
    if (diff <= 1) { streak++; prev = new Date(d); }
    else break;
  }
  return streak;
}

function sessionsThisWeek() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  return state.sessions.filter(s => new Date(s.date) >= weekStart).length;
}

// ---------------------------------------------------------------------------
// Full render
// ---------------------------------------------------------------------------

export function render() {
  renderDashboard();
  renderWorkoutsList();
  renderLogSelect();
  updateSidebar();
}

function updateSidebar() {
  document.getElementById('streak-val').textContent = calcStreak() + ' DAYS';
  document.getElementById('sessions-week').textContent = sessionsThisWeek();
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function renderDashboard() {
  const totalVol = state.sessions.reduce((s, sess) =>
    s + (sess.exercises || []).reduce((ev, ex) =>
      ev + (ex.sets || []).reduce((sv, set) =>
        sv + (parseFloat(set.weight) || 0) * (parseFloat(set.reps) || 0), 0), 0), 0);

  document.getElementById('total-sessions-val').textContent = state.sessions.length;
  document.getElementById('total-volume-val').textContent = Math.round(totalVol).toLocaleString();
  document.getElementById('pr-count-val').textContent = Object.keys(state.prs).length;

  // Activity grid (35 days)
  const sessionDates = new Set(state.sessions.map(s => s.date.split('T')[0]));
  let gridHtml = '';
  for (let i = 34; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    gridHtml += `<div class="streak-day ${sessionDates.has(ds) ? 'hit' : ''}" title="${ds}"></div>`;
  }
  document.getElementById('streak-grid').innerHTML = gridHtml;

  // Recent sessions
  const el = document.getElementById('recent-sessions');
  if (!state.sessions.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🏋️</div><h3>No sessions yet</h3><p>Log your first workout to get started.</p></div>';
    return;
  }
  const recent = [...state.sessions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  el.innerHTML = recent.map(s => {
    const vol = (s.exercises || []).reduce((ev, ex) =>
      ev + (ex.sets || []).reduce((sv, set) =>
        sv + (parseFloat(set.weight) || 0) * (parseFloat(set.reps) || 0), 0), 0);
    const d = new Date(s.date);
    return `<div class="workout-card">
      <div class="workout-dot"></div>
      <div class="workout-info">
        <div class="workout-name">${s.workoutName || 'Session'}</div>
        <div class="workout-meta">${d.toLocaleDateString()} · ${(s.exercises || []).length} exercises · ${Math.round(vol).toLocaleString()} kg volume</div>
      </div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export function renderWorkoutsList() {
  const el = document.getElementById('workouts-list');
  if (!state.workouts.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><h3>No workouts yet</h3><p>Create your first routine to get started.</p></div>';
    return;
  }
  el.innerHTML = `<div class="workout-list">${state.workouts.map(w => `
    <div class="workout-card">
      <div class="workout-dot"></div>
      <div class="workout-info">
        <div class="workout-name">${w.name}</div>
        <div class="workout-meta">${w.category} · ${(w.exercises || []).length} exercises</div>
      </div>
      <div class="workout-actions">
        <button class="btn btn-ghost btn-sm" onclick="App.editWorkout('${w.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="App.deleteWorkout('${w.id}')">Delete</button>
      </div>
    </div>`).join('')}</div>`;
}

export function openWorkoutModal(id) {
  editingWorkoutId = id || null;
  exerciseCount = 0;
  document.getElementById('exercise-list').innerHTML = '';
  document.getElementById('workout-name-input').value = '';

  if (id) {
    const w = state.workouts.find(x => x.id === id);
    document.getElementById('modal-workout-title').textContent = 'EDIT WORKOUT';
    document.getElementById('workout-name-input').value = w.name;
    document.getElementById('workout-category').value = w.category;
    (w.exercises || []).forEach(ex => addExerciseRow(ex));
  } else {
    document.getElementById('modal-workout-title').textContent = 'NEW WORKOUT';
    addExerciseRow();
  }
  document.getElementById('workout-modal').classList.add('open');
}

export function closeWorkoutModal() {
  document.getElementById('workout-modal').classList.remove('open');
}

export function editWorkout(id) { openWorkoutModal(id); }

export function deleteWorkout(id) {
  if (!confirm('Delete this workout?')) return;
  state.workouts = state.workouts.filter(w => w.id !== id);
  saveState();
  render();
}

export function addExerciseRow(ex) {
  const i = exerciseCount++;
  const el = document.createElement('div');
  el.id = 'ex-row-' + i;
  el.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';

  const opts = DEFAULT_EXERCISES
    .map(e => `<option ${ex?.name === e.name ? 'selected' : ''}>${e.name}</option>`)
    .join('');

  el.innerHTML = `
    <select style="flex:2;" id="ex-name-${i}"><option value="">Exercise...</option>${opts}</select>
    <select style="flex:1;" id="ex-muscle-${i}">
      ${MUSCLE_GROUPS.map(m => `<option ${ex?.muscles === m ? 'selected' : ''}>${m}</option>`).join('')}
    </select>
    <input type="number" placeholder="Sets" value="${ex?.sets || 3}" id="ex-sets-${i}" style="width:60px;flex-shrink:0;">
    <input type="text"   placeholder="Reps" value="${ex?.reps || '10'}" id="ex-reps-${i}" style="width:70px;flex-shrink:0;">
    <button class="btn btn-ghost btn-icon" onclick="document.getElementById('ex-row-${i}').remove()">✕</button>`;

  el.querySelector(`#ex-name-${i}`).addEventListener('change', function () {
    const found = DEFAULT_EXERCISES.find(e => e.name === this.value);
    if (found) el.querySelector(`#ex-muscle-${i}`).value = found.muscles;
  });

  // Handle custom (non-default) exercise names when editing
  if (ex?.name && !DEFAULT_EXERCISES.find(e => e.name === ex.name)) {
    const sel = el.querySelector(`#ex-name-${i}`);
    sel.insertAdjacentHTML('afterbegin', `<option value="${ex.name}" selected>${ex.name}</option>`);
  }

  document.getElementById('exercise-list').appendChild(el);
}

export function saveWorkout() {
  const name = document.getElementById('workout-name-input').value.trim();
  if (!name) { alert('Please enter a workout name.'); return; }

  const exercises = [];
  document.querySelectorAll('[id^="ex-name-"]').forEach(sel => {
    const i = sel.id.split('-').pop();
    const n = sel.value || sel.options[sel.selectedIndex]?.text;
    if (n && n !== 'Exercise...') {
      exercises.push({
        name: n,
        muscles: document.getElementById('ex-muscle-' + i)?.value || '',
        sets:    document.getElementById('ex-sets-'   + i)?.value || '3',
        reps:    document.getElementById('ex-reps-'   + i)?.value || '10',
      });
    }
  });

  if (!exercises.length) { alert('Add at least one exercise.'); return; }

  const category = document.getElementById('workout-category').value;
  if (editingWorkoutId) {
    const idx = state.workouts.findIndex(w => w.id === editingWorkoutId);
    state.workouts[idx] = { ...state.workouts[idx], name, category, exercises };
  } else {
    state.workouts.push({ id: Date.now().toString(), name, category, exercises });
  }

  saveState();
  render();
  closeWorkoutModal();
}

// ---------------------------------------------------------------------------
// Session Logger
// ---------------------------------------------------------------------------

export function renderLogSelect() {
  const sel = document.getElementById('log-workout-select');
  const val = sel.value;
  sel.innerHTML = '<option value="">— Choose a workout —</option>' +
    state.workouts.map(w => `<option value="${w.id}" ${val === w.id ? 'selected' : ''}>${w.name}</option>`).join('');
  if (val) loadWorkoutForLog();
}

export function loadWorkoutForLog() {
  const wid = document.getElementById('log-workout-select').value;
  const logEl = document.getElementById('log-exercises');
  const subEl = document.getElementById('log-submit');

  if (!wid) { logEl.innerHTML = ''; subEl.style.display = 'none'; return; }

  const w = state.workouts.find(x => x.id === wid);
  if (!w) return;

  subEl.style.display = 'block';
  logEl.innerHTML = (w.exercises || []).map((ex, ei) => {
    const setsHtml = Array.from({ length: parseInt(ex.sets) || 3 }, (_, si) => `
      <div class="set-row">
        <div class="set-num" id="set-num-${ei}-${si}">${si + 1}</div>
        <input class="set-input" type="number" placeholder="kg"   id="log-weight-${ei}-${si}" min="0" step="0.5">
        <input class="set-input" type="number" placeholder="reps" id="log-reps-${ei}-${si}"   min="0">
        <button class="btn btn-ghost btn-sm" onclick="App.markSet(${ei},${si})">✓</button>
      </div>`).join('');
    const pr = state.prs[ex.name];
    return `<div class="card" style="margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div>
          <div style="font-weight:500;font-size:14px;">${ex.name}</div>
          <div style="color:var(--muted);font-size:12px;margin-top:2px;">
            ${ex.sets} sets × ${ex.reps} reps · <span class="tag ${ex.muscles?.toLowerCase()}">${ex.muscles}</span>
          </div>
        </div>
        ${pr ? `<div class="pr-badge">🏆 PR: ${pr.weight}kg × ${pr.reps}</div>` : ''}
      </div>
      <div id="sets-${ei}">${setsHtml}</div>
    </div>`;
  }).join('');
}

export function markSet(ei, si) {
  document.getElementById(`set-num-${ei}-${si}`)?.classList.toggle('done');
}

export function saveSession() {
  const wid = document.getElementById('log-workout-select').value;
  const w = state.workouts.find(x => x.id === wid);
  if (!w) return;

  const session = {
    id:          Date.now().toString(),
    date:        new Date().toISOString(),
    workoutId:   wid,
    workoutName: w.name,
    notes:       document.getElementById('session-notes').value,
    exercises:   (w.exercises || []).map((ex, ei) => ({
      name:    ex.name,
      muscles: ex.muscles,
      sets:    Array.from({ length: parseInt(ex.sets) || 3 }, (_, si) => ({
        weight: document.getElementById(`log-weight-${ei}-${si}`)?.value || '0',
        reps:   document.getElementById(`log-reps-${ei}-${si}`)?.value  || '0',
      })),
    })),
  };

  // Detect PRs
  session.exercises.forEach(ex => {
    ex.sets.forEach(set => {
      const w = parseFloat(set.weight), r = parseFloat(set.reps);
      if (w > 0 && r > 0) {
        const cur = state.prs[ex.name];
        if (!cur || w > cur.weight || (w === cur.weight && r > cur.reps)) {
          state.prs[ex.name] = { weight: w, reps: r };
        }
      }
    });
  });

  state.sessions.push(session);
  saveState();
  render();

  // Reset form
  document.getElementById('session-notes').value = '';
  document.getElementById('log-workout-select').value = '';
  document.getElementById('log-exercises').innerHTML = '';
  document.getElementById('log-submit').style.display = 'none';

  showView('dashboard');
  alert('Session saved! Great work 💪');
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function renderProgress() {
  const sessions = [...state.sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels  = sessions.map(s => new Date(s.date).toLocaleDateString());
  const volumes = sessions.map(s => Math.round(
    (s.exercises || []).reduce((ev, ex) =>
      ev + (ex.sets || []).reduce((sv, set) =>
        sv + (parseFloat(set.weight) || 0) * (parseFloat(set.reps) || 0), 0), 0)));

  const ctx = document.getElementById('volumeChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length ? labels : ['No data'],
      datasets: [{
        label: 'Volume (kg)',
        data: volumes.length ? volumes : [0],
        borderColor: '#e8ff47',
        backgroundColor: 'rgba(232,255,71,0.08)',
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#e8ff47',
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#7a7a85', font: { family: 'DM Sans', size: 11 } }, grid: { color: '#2e2e34' } },
        y: { ticks: { color: '#7a7a85', font: { family: 'DM Sans', size: 11 } }, grid: { color: '#2e2e34' } },
      },
    },
  });

  // PR table
  const prEl = document.getElementById('pr-list');
  if (!Object.keys(state.prs).length) {
    prEl.innerHTML = '<div class="empty"><div class="empty-icon">🏆</div><h3>No PRs recorded yet</h3><p>Log sessions to see your personal records.</p></div>';
    return;
  }
  prEl.innerHTML = `<table class="ex-table">
    <thead><tr><th>Exercise</th><th>Best Weight</th><th>Best Reps</th></tr></thead>
    <tbody>${Object.entries(state.prs).map(([name, pr]) =>
      `<tr>
        <td><div class="ex-name">${name}</div></td>
        <td style="font-weight:500;color:var(--accent)">${pr.weight} kg</td>
        <td>${pr.reps}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

// ---------------------------------------------------------------------------
// AI Coach UI
// ---------------------------------------------------------------------------

export function appendMsg(role, text) {
  const el = document.getElementById('chat-messages');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = `<div class="msg-bubble">${text.replace(/\n/g, '<br>')}</div><div class="msg-time">${time}</div>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  return div;
}

export function appendTyping() {
  const el = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.innerHTML = '<div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  return div;
}

export async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  appendMsg('user', text);
  const typing = appendTyping();

  await sendCoachMessage(
    text,
    (reply) => { typing.remove(); appendMsg('ai', reply); },
    (err)   => { typing.remove(); appendMsg('ai', err); }
  );
}

export function quickPrompt(text) {
  document.getElementById('chat-input').value = text;
  showView('coach');
  sendMessage();
}

export function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting-text').textContent = `${g} — let's crush today's session.`;
}

export async function init() {
  setGreeting();
  await loadState();
  render();
}
