/**
 * app.js
 * Core application logic for Operation Swole.
 * Handles navigation, rendering all views, workout/session CRUD,
 * PR detection, progress chart, and weekly planning.
 */

import { state, loadState, saveState } from './storage.js';
import { proposePlan, getProgressionTargets, shouldDeload } from './planner.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];

export const DEFAULT_EXERCISES = [
  { name: 'Bench Press',            muscles: 'Chest',     defaultSets: 4, defaultReps: '6-8'   },
  { name: 'Squat',                  muscles: 'Legs',      defaultSets: 4, defaultReps: '5'      },
  { name: 'Deadlift',               muscles: 'Back',      defaultSets: 3, defaultReps: '5'      },
  { name: 'Overhead Press',         muscles: 'Shoulders', defaultSets: 3, defaultReps: '8'      },
  { name: 'Pull-Up',                muscles: 'Back',      defaultSets: 3, defaultReps: '8-10'   },
  { name: 'Row',                    muscles: 'Back',      defaultSets: 3, defaultReps: '10'     },
  { name: 'Incline Dumbbell Press', muscles: 'Chest',     defaultSets: 3, defaultReps: '10-12'  },
  { name: 'Romanian Deadlift',      muscles: 'Legs',      defaultSets: 3, defaultReps: '10'     },
  { name: 'Lateral Raise',          muscles: 'Shoulders', defaultSets: 3, defaultReps: '15'     },
  { name: 'Curl',                   muscles: 'Arms',      defaultSets: 3, defaultReps: '12'     },
  { name: 'Tricep Pushdown',        muscles: 'Arms',      defaultSets: 3, defaultReps: '12'     },
  { name: 'Plank',                  muscles: 'Core',      defaultSets: 3, defaultReps: '60s'    },
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let editingWorkoutId = null;
let exerciseCount    = 0;
let chartInstance    = null;
let proposedPlan     = null;
let planForNextWeek  = false;
let dragSourceIdx    = null;

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.getElementById('nav-'  + name).classList.add('active');

  if (name === 'dashboard') renderDashboard();
  if (name === 'progress')  renderProgress();
  if (name === 'next')      renderNextWorkout();
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
  document.getElementById('streak-val').textContent    = calcStreak() + ' DAYS';
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
  document.getElementById('total-volume-val').textContent   = Math.round(totalVol).toLocaleString();
  document.getElementById('pr-count-val').textContent       = Object.keys(state.prs).length;

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
  exerciseCount    = 0;
  document.getElementById('exercise-list').innerHTML     = '';
  document.getElementById('workout-name-input').value    = '';

  if (id) {
    const w = state.workouts.find(x => x.id === id);
    document.getElementById('modal-workout-title').textContent = 'EDIT WORKOUT';
    document.getElementById('workout-name-input').value        = w.name;
    document.getElementById('workout-category').value          = w.category;
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

export function editWorkout(id)  { openWorkoutModal(id); }

export function deleteWorkout(id) {
  if (!confirm('Delete this workout?')) return;
  state.workouts = state.workouts.filter(w => w.id !== id);
  saveState();
  render();
}

export function addExerciseRow(ex) {
  const i   = exerciseCount++;
  const el  = document.createElement('div');
  el.id     = 'ex-row-' + i;
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
        name:    n,
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
  const wid   = document.getElementById('log-workout-select').value;
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
  const w   = state.workouts.find(x => x.id === wid);
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
      const wt = parseFloat(set.weight), r = parseFloat(set.reps);
      if (wt > 0 && r > 0) {
        const cur = state.prs[ex.name];
        if (!cur || wt > cur.weight || (wt === cur.weight && r > cur.reps)) {
          state.prs[ex.name] = { weight: wt, reps: r };
        }
      }
    });
  });

  state.sessions.push(session);

  // Mark today's plan day as done
  if (state.plan) {
    const todayStr = session.date.split('T')[0];
    const planDay  = state.plan.days.find(d => d.date === todayStr);
    if (planDay && planDay.type !== 'rest' && planDay.type !== 'hiit') {
      planDay.status = 'done';
    }
  }

  saveState();
  render();

  // Reset form
  document.getElementById('session-notes').value             = '';
  document.getElementById('log-workout-select').value        = '';
  document.getElementById('log-exercises').innerHTML         = '';
  document.getElementById('log-submit').style.display        = 'none';

  showView('dashboard');
  alert('Session saved! Great work 💪');
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function renderProgress() {
  const sessions = [...state.sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels   = sessions.map(s => new Date(s.date).toLocaleDateString());
  const volumes  = sessions.map(s => Math.round(
    (s.exercises || []).reduce((ev, ex) =>
      ev + (ex.sets || []).reduce((sv, set) =>
        sv + (parseFloat(set.weight) || 0) * (parseFloat(set.reps) || 0), 0), 0)));

  const ctx = document.getElementById('volumeChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels:   labels.length ? labels : ['No data'],
      datasets: [{
        label:           'Volume (kg)',
        data:            volumes.length ? volumes : [0],
        borderColor:     '#e8ff47',
        backgroundColor: 'rgba(232,255,71,0.08)',
        tension:         0.3,
        fill:            true,
        pointBackgroundColor: '#e8ff47',
        pointRadius:     4,
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
// Next Workout — week overview + today's session
// ---------------------------------------------------------------------------

export function renderNextWorkout() {
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const isSunday = today.getDay() === 0;

  // Show/hide "Plan Next Week" button on Sundays
  document.getElementById('btn-plan-next-week').style.display = isSunday ? 'inline-flex' : 'none';

  // Check if there's a valid plan for the current week
  const plan = getCurrentWeekPlan();

  if (!plan) {
    document.getElementById('today-section').style.display = 'none';
    document.getElementById('week-grid').innerHTML = `
      <div class="empty">
        <div class="empty-icon">📅</div>
        <h3>No plan for this week</h3>
        <p>Click "Plan This Week" to generate your schedule.</p>
      </div>`;
    return;
  }

  renderTodayCard(plan, todayStr);
  renderWeekGrid(plan, todayStr);
}

function getCurrentWeekPlan() {
  if (!state.plan) return null;
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  // Monday of current week
  const dow     = today.getDay();
  const monday  = new Date(today);
  monday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
  const mondayStr = monday.toISOString().split('T')[0];
  return state.plan.weekStart === mondayStr ? state.plan : null;
}

function renderTodayCard(plan, todayStr) {
  const todaySection = document.getElementById('today-section');
  const todayCardEl  = document.getElementById('today-card');
  const todayDay     = plan.days.find(d => d.date === todayStr);

  if (!todayDay || todayDay.type === 'rest') {
    todaySection.style.display = 'none';
    return;
  }

  todaySection.style.display = 'block';

  if (todayDay.type === 'hiit') {
    todayCardEl.innerHTML = `
      <div class="card today-card">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div class="workout-name" style="font-size:16px;">High Intensity Class ⚡</div>
            <div class="workout-meta" style="margin-top:4px;">Fixed session — no pre-filled targets</div>
          </div>
          ${todayDay.status === 'done' ? '<div class="pr-badge" style="color:var(--success);background:rgba(77,255,145,.15)">✓ Done</div>' : ''}
        </div>
      </div>`;
    return;
  }

  if (todayDay.status === 'done') {
    todayCardEl.innerHTML = `
      <div class="card today-card">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="workout-dot" style="background:var(--success)"></div>
          <div>
            <div class="workout-name">Session completed ✓</div>
            <div class="workout-meta">Great work today!</div>
          </div>
        </div>
      </div>`;
    return;
  }

  const workout = todayDay.workoutId
    ? state.workouts.find(w => w.id === todayDay.workoutId)
    : null;

  if (!workout) {
    const typeLabel = todayDay.type.toUpperCase();
    todayCardEl.innerHTML = `
      <div class="card today-card">
        <div class="workout-name">${typeLabel} DAY</div>
        <div class="workout-meta" style="margin-top:6px;">
          No ${todayDay.type} workout found. Create one in the Workouts tab and re-plan.
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:12px;" onclick="App.showView('workouts')">
          Create Workout
        </button>
      </div>`;
    return;
  }

  const exerciseRows = (workout.exercises || []).map(ex => {
    const targets   = getProgressionTargets(ex.name, state.sessions, parseInt(ex.sets) || 3);
    const weightStr = targets.weight > 0 ? `${targets.weight} kg` : 'Start light';
    return `
      <div class="target-row">
        <div>
          <span class="ex-name">${ex.name}</span>
          <span class="tag ${ex.muscles?.toLowerCase()}" style="margin-left:6px;">${ex.muscles}</span>
        </div>
        <div class="target-info">${targets.sets}×${targets.reps} @ ${weightStr}</div>
      </div>`;
  }).join('');

  const deloadNote = todayDay.type === 'deload'
    ? '<div class="deload-badge">Deload Week — reduce weights ~20%</div>'
    : '';

  todayCardEl.innerHTML = `
    <div class="card today-card">
      ${deloadNote}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
        <div>
          <div class="workout-name" style="font-size:16px;">${workout.name}</div>
          <div class="workout-meta" style="margin-top:4px;">
            ${todayDay.type.toUpperCase()} · ${(workout.exercises||[]).length} exercises · Target: 3×8–12
          </div>
        </div>
      </div>
      <div class="target-exercises">${exerciseRows}</div>
      <button class="btn btn-primary" style="margin-top:16px;" onclick="App.startPlannedSession()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Start Session
      </button>
    </div>`;
}

function renderWeekGrid(plan, todayStr) {
  const el = document.getElementById('week-grid');
  el.innerHTML = `<div class="week-grid">${plan.days.map((day, i) => {
    const isToday   = day.date === todayStr;
    const dateNum   = new Date(day.date + 'T00:00:00').getDate();
    const statusCls = isToday ? 'today' : day.status === 'done' ? 'done' : day.status === 'skipped' ? 'skipped' : '';
    const typeCls   = `type-${day.type}`;
    const icon      = day.status === 'done' ? '✓'
                    : isToday && day.type !== 'rest' ? '→'
                    : day.type === 'hiit' ? '⚡'
                    : day.type === 'rest' ? ''
                    : day.status === 'skipped' ? '—'
                    : '·';

    return `
      <div class="day-card ${statusCls} ${typeCls}" onclick="App.previewDayWorkout('${day.date}')">
        <div class="day-name">${DAY_NAMES[i]}</div>
        <div class="day-num">${dateNum}</div>
        <div class="day-type-badge">${day.type.toUpperCase()}</div>
        <div class="day-icon">${icon}</div>
      </div>`;
  }).join('')}</div>`;
}

export function previewDayWorkout(date) {
  const day = state.plan?.days.find(d => d.date === date);
  if (!day || day.type === 'rest' || day.type === 'hiit' || !day.workoutId) return;
  const sel = document.getElementById('log-workout-select');
  sel.value = day.workoutId;
  loadWorkoutForLog();
  showView('log');
}

export function startPlannedSession() {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayDay = state.plan?.days.find(d => d.date === todayStr);

  if (!todayDay?.workoutId) { showView('log'); return; }

  const sel     = document.getElementById('log-workout-select');
  sel.value     = todayDay.workoutId;
  loadWorkoutForLog();

  // Pre-fill progression targets
  const workout = state.workouts.find(w => w.id === todayDay.workoutId);
  if (workout) {
    (workout.exercises || []).forEach((ex, ei) => {
      const t = getProgressionTargets(ex.name, state.sessions, parseInt(ex.sets) || 3);
      if (t.weight > 0) {
        for (let si = 0; si < (parseInt(ex.sets) || 3); si++) {
          const wEl = document.getElementById(`log-weight-${ei}-${si}`);
          const rEl = document.getElementById(`log-reps-${ei}-${si}`);
          if (wEl) wEl.value = t.weight;
          if (rEl) rEl.value = t.reps;
        }
      }
    });
  }

  showView('log');
}

// ---------------------------------------------------------------------------
// Planning modal
// ---------------------------------------------------------------------------

export function openPlanningModal(forNextWeek = false) {
  planForNextWeek = forNextWeek;
  proposedPlan    = proposePlan(state, forNextWeek);

  const monday = new Date(proposedPlan.weekStart + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  document.getElementById('plan-modal-title').textContent    = forNextWeek ? 'PLAN NEXT WEEK' : 'PLAN THIS WEEK';
  document.getElementById('plan-modal-subtitle').textContent =
    `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  if (proposedPlan.isDeload) {
    document.getElementById('plan-modal-deload').style.display = 'block';
  } else {
    document.getElementById('plan-modal-deload').style.display = 'none';
  }

  renderPlanGrid();
  document.getElementById('plan-modal').classList.add('open');
}

export function closePlanningModal() {
  document.getElementById('plan-modal').classList.remove('open');
  proposedPlan = null;
}

export function regeneratePlan() {
  proposedPlan = proposePlan(state, planForNextWeek);
  renderPlanGrid();
}

export function confirmPlan() {
  if (!proposedPlan) return;
  state.plan = { weekStart: proposedPlan.weekStart, days: proposedPlan.days };
  state.settings.pplRotationNext = proposedPlan.nextRotation;
  saveState();
  closePlanningModal();
  renderNextWorkout();
}

function renderPlanGrid() {
  const el = document.getElementById('plan-grid');
  el.innerHTML = proposedPlan.days.map((day, i) => {
    const isHiit   = day.type === 'hiit';
    const draggable = !isHiit ? 'true' : 'false';
    const dateNum  = new Date(day.date + 'T00:00:00').getDate();

    return `
      <div class="plan-day-card type-${day.type}${isHiit ? ' hiit-fixed' : ''}"
           data-index="${i}"
           draggable="${draggable}"
           ondragstart="App.handleDragStart(event,${i})"
           ondragover="App.handleDragOver(event)"
           ondragleave="App.handleDragLeave(event)"
           ondrop="App.handleDrop(event,${i})"
           ondragend="App.handleDragEnd(event)">
        <div class="plan-day-name">${DAY_NAMES[i]}</div>
        <div class="plan-day-num">${dateNum}</div>
        <div class="plan-day-type">${day.type.toUpperCase()}</div>
        ${isHiit ? '<div class="plan-fixed-label">fixed</div>' : ''}
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Drag and drop (planning modal)
// ---------------------------------------------------------------------------

export function handleDragStart(event, index) {
  dragSourceIdx = index;
  event.currentTarget.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
}

export function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('drag-over');
}

export function handleDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

export function handleDrop(event, targetIndex) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if (dragSourceIdx === null || dragSourceIdx === targetIndex) return;

  const src = proposedPlan.days[dragSourceIdx];
  const tgt = proposedPlan.days[targetIndex];

  // Disallow swapping with HIIT
  if (src.type === 'hiit' || tgt.type === 'hiit') return;

  [src.type,      tgt.type]      = [tgt.type,      src.type];
  [src.workoutId, tgt.workoutId] = [tgt.workoutId, src.workoutId];

  dragSourceIdx = null;
  renderPlanGrid();
}

export function handleDragEnd(event) {
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.plan-day-card').forEach(c => c.classList.remove('drag-over'));
  dragSourceIdx = null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  const icon  = document.getElementById('settings-toggle-icon');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  icon.textContent    = open ? '▲' : '▼';
  if (open) renderSettingsPanel();
}

function renderSettingsPanel() {
  // HIIT day select
  const hiitSel = document.getElementById('settings-hiit-day');
  hiitSel.value = state.settings.hiitDay;

  // Available days checkboxes
  const container = document.getElementById('settings-days-checkboxes');
  container.innerHTML = DOW_NAMES.map((name, dow) => {
    const checked = state.settings.availableDays.includes(dow) ? 'checked' : '';
    return `<label style="display:inline-flex;align-items:center;gap:6px;margin-right:12px;cursor:pointer;">
      <input type="checkbox" value="${dow}" ${checked} onchange="App.updateSettings()">
      ${name.slice(0, 3)}
    </label>`;
  }).join('');
}

export function updateSettings() {
  state.settings.hiitDay = parseInt(document.getElementById('settings-hiit-day').value);

  const checkedDays = [...document.querySelectorAll('#settings-days-checkboxes input:checked')]
    .map(cb => parseInt(cb.value));
  state.settings.availableDays = checkedDays;

  saveState();
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
  renderNextWorkout();
}
