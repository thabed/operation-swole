/**
 * planner.js
 * Scheduling algorithm and progressive overload logic for Operation Swole.
 */

const REPS_MIN = 8;
const REPS_MAX = 12;
const PPL_SEQUENCE = ['push', 'pull', 'legs'];

// kg to add per muscle group when all reps hit REPS_MAX
const WEIGHT_INCREMENT = {
  Legs:      5,
  Back:      2.5,
  Chest:     2.5,
  Shoulders: 2.5,
  Arms:      2.5,
  Core:      2.5,
  Cardio:    0,
};

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function getMondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const wn = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(wn).padStart(2, '0')}`;
}

function findWorkoutForType(type, workouts) {
  if (!workouts.length) return null;
  const catMap = { push: 'push', pull: 'pull', legs: 'legs', run: 'cardio' };
  const cat = catMap[type];
  if (!cat) return null;
  const match = workouts.find(w =>
    w.category?.toLowerCase() === cat ||
    w.name?.toLowerCase().includes(type === 'run' ? 'run' : type)
  );
  return match?.id || null;
}

/**
 * Returns true if the 3 most recent training weeks all exceed 110% of the
 * baseline average volume — signal to schedule a deload week.
 */
export function shouldDeload(sessions) {
  if (sessions.length < 5) return false;

  const byWeek = {};
  for (const s of sessions) {
    const wk = isoWeek(s.date.split('T')[0]);
    const vol = (s.exercises || []).reduce((ev, ex) =>
      ev + (ex.sets || []).reduce((sv, set) =>
        sv + (parseFloat(set.weight) || 0) * (parseFloat(set.reps) || 0), 0), 0);
    byWeek[wk] = (byWeek[wk] || 0) + vol;
  }

  const weeks = Object.keys(byWeek).sort();
  if (weeks.length < 4) return false;

  const recent   = weeks.slice(-3);
  const baseline = weeks.slice(0, -3);
  const avg      = baseline.reduce((s, w) => s + byWeek[w], 0) / baseline.length;

  return recent.every(w => byWeek[w] > avg * 1.1);
}

/**
 * Returns the target weight, reps, and sets for the next session of an exercise.
 * Rep-based progression: once every set hits REPS_MAX, add weight and reset to REPS_MIN.
 * Otherwise stay at the same weight and reps.
 *
 * @returns {{ weight: number, reps: number, sets: number }}
 */
export function getProgressionTargets(exerciseName, sessions, defaultSets = 3) {
  const relevant = [...sessions]
    .filter(s => (s.exercises || []).some(ex => ex.name === exerciseName))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!relevant.length) return { weight: 0, reps: REPS_MIN, sets: defaultSets };

  const lastEx = relevant[0].exercises.find(ex => ex.name === exerciseName);
  if (!lastEx?.sets?.length)  return { weight: 0, reps: REPS_MIN, sets: defaultSets };

  const weights  = lastEx.sets.map(s => parseFloat(s.weight) || 0);
  const repsArr  = lastEx.sets.map(s => parseFloat(s.reps)   || 0);
  const maxW     = Math.max(...weights);
  const numSets  = repsArr.length || defaultSets;
  const allMaxed = repsArr.length > 0 && repsArr.every(r => r >= REPS_MAX);

  if (allMaxed && maxW > 0) {
    const inc = WEIGHT_INCREMENT[lastEx.muscles] ?? 2.5;
    return { weight: maxW + inc, reps: REPS_MIN, sets: numSets };
  }

  const avgReps = repsArr.length
    ? Math.round(repsArr.reduce((a, b) => a + b, 0) / repsArr.length)
    : REPS_MIN;

  return { weight: maxW, reps: Math.max(avgReps, REPS_MIN), sets: numSets };
}

/**
 * Generate a proposed weekly plan (Mon–Sun) based on current state and settings.
 * Does NOT mutate state — call confirmPlan() to persist.
 *
 * @param {object}  state
 * @param {boolean} forNextWeek - true → plan the upcoming week
 * @returns {{ weekStart, days, nextRotation, isDeload }}
 */
export function proposePlan(state, forNextWeek = false) {
  const { settings, workouts, sessions } = state;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let monday;
  if (forNextWeek) {
    const dow = today.getDay();
    monday   = new Date(today);
    monday.setDate(today.getDate() + (dow === 0 ? 1 : 8 - dow));
  } else {
    monday = getMondayOf(today);
  }

  const deload = shouldDeload(sessions);

  // Build 7-day skeleton
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { date: toISODate(d), type: 'rest', workoutId: null, status: 'pending' };
  });

  // Place fixed HIIT (hiitDay uses getDay() 0=Sun…6=Sat → convert to Mon-based index)
  const hiitDow   = settings.hiitDay;
  const hiitIndex = hiitDow === 0 ? 6 : hiitDow - 1;
  if (hiitIndex >= 0 && hiitIndex <= 6) days[hiitIndex].type = 'hiit';

  // Place fixed running day
  const runDow   = settings.runningDay;
  const runIndex = (runDow != null) ? (runDow === 0 ? 6 : runDow - 1) : -1;
  if (runIndex >= 0 && runIndex <= 6) {
    days[runIndex].type      = 'run';
    days[runIndex].workoutId = findWorkoutForType('run', workouts);
  }

  // Fixed day indices used for adjacency constraint
  const fixedIndices = [hiitIndex, runIndex].filter(i => i >= 0 && i <= 6);

  // Collect available lifting-day indices
  const liftingCandidates = [];
  for (let i = 0; i < 7; i++) {
    if (days[i].type === 'hiit' || days[i].type === 'run') continue;
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (settings.availableDays.includes(d.getDay())) liftingCandidates.push(i);
  }

  // Assign PPL types to up to 3 lifting days
  let rotIdx = Math.max(0, PPL_SEQUENCE.indexOf(settings.pplRotationNext));
  const liftDays = liftingCandidates.slice(0, 3);

  for (let li = 0; li < liftDays.length; li++) {
    let type = PPL_SEQUENCE[rotIdx % 3];

    // Don't schedule legs adjacent to any fixed day (HIIT or running)
    if (type === 'legs' && fixedIndices.some(fi => Math.abs(liftDays[li] - fi) === 1)) {
      const alt = PPL_SEQUENCE[(rotIdx + 1) % 3];
      if (alt !== 'legs') { type = alt; rotIdx++; }
    }

    const idx = liftDays[li];
    days[idx].type      = deload ? 'deload' : type;
    days[idx].workoutId = findWorkoutForType(type, workouts);
    rotIdx++;
  }

  // Annotate past days in the current week
  if (!forNextWeek) {
    const todayStr = toISODate(today);
    for (const day of days) {
      if (day.date > todayStr) break;
      if (day.type === 'rest' || day.type === 'hiit' || day.type === 'run') continue;
      const done = sessions.some(s => s.date.startsWith(day.date));
      day.status = done ? 'done' : (day.date < todayStr ? 'skipped' : 'pending');
    }
    // Mark today done if a session exists
    const todayDay = days.find(d => d.date === todayStr);
    if (todayDay && sessions.some(s => s.date.startsWith(todayStr))) {
      todayDay.status = 'done';
    }
  }

  return {
    weekStart:    toISODate(monday),
    days,
    nextRotation: PPL_SEQUENCE[rotIdx % 3],
    isDeload:     deload,
  };
}
