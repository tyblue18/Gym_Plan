/* ============================================================
   app-state.js — Que fitness tracker
   Global state, constants, shared utilities, localStorage
   persistence layer, page navigation, and app bootstrapper.
   Must load FIRST — all other modules depend on these globals.
   ============================================================ */

/* ── GLOBAL STATE ─────────────────────────────────────────── */
let localDBInstance    = {};
const _today           = new Date();
let activeDayFocusString = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
let currentDisplayDate = new Date(_today.getFullYear(), _today.getMonth(), _today.getDate());
let activeViewMode     = "month";
let currentGroup       = "chest";
let lastBurn           = 0;
let lastBudget         = 0;
let pendingSetsCount   = 3;
let pendingSetData     = [{r:'1',w:''},{r:'1',w:''},{r:'1',w:''}];

/* ── STATIC CONSTANTS ─────────────────────────────────────── */
const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
];

const PRESETS = {
    chest:     ["Bench Press","Incline Bench Press","Decline Bench Press","Chest Flyes","Cable Crossover","Push-ups","Machine Chest Press","Pec Deck","Smith Machine Press","Dumbbell Pullover"],
    back:      ["Pull-ups","Chin-ups","Lat Pulldown","T-Bar Row","Barbell Row","Seated Cable Row","Single-Arm Row","Face Pulls","Shrugs","Deadlift","Sumo Deadlift","Rack Pull","Straight-Arm Pulldown"],
    tricep:    ["Tricep Pushdown","Overhead Tricep Extension","Skull Crushers","Close-Grip Bench","Dips","Cable Tricep Kickback","Diamond Push-ups","Tricep Machine"],
    bicep:     ["Barbell Curl","Dumbbell Curl","Hammer Curls","Preacher Curl","Incline Curl","Cable Curl","Concentration Curl","Spider Curl","21s"],
    forearms:  ["Wrist Curls","Reverse Wrist Curls","Reverse Curl","Farmer Carries","Dead Hang","Plate Pinch"],
    shoulders: ["Overhead Press","Arnold Press","Lateral Raises","Front Raises","Rear Delt Flyes","Cable Lateral Raise","Face Pulls","Upright Row","Machine Shoulder Press"],
    abs:       ["Plank","Side Plank","Crunches","Bicycle Crunches","Dead Bug","Russian Twists","Hanging Leg Raises","Cable Crunch","Ab Wheel Rollout","V-ups","Pallof Press","Dragon Flag"],
    quads:     ["Back Squat","Front Squat","Leg Press","Leg Extension","Lunges","Bulgarian Split Squat","Pendulum Squat","Hack Squat","Step-ups"],
    hamstring: ["Romanian Deadlift","Stiff-Leg Deadlift","Leg Curl","Seated Leg Curl","Nordic Curl","Good Mornings","Glute-Ham Raise"],
    glutes:    ["Hip Thrust","Glute Bridge","Glute Kickback","Cable Pull-Through","Frog Pump","Donkey Kicks"],
    calfs:     ["Standing Calf Raise","Seated Calf Raise","Single-Leg Calf Raise","Donkey Calf Raise","Leg Press Calf Raise"],
    adductors: ["Hip Adduction Machine","Copenhagen Plank","Wide-Stance Squat","Side Lunges","Cable Hip Adduction","Sumo Squat"]
};

const defaultTemplates = [
    {id:"1",title:"Day 1: Upper Body HIT + Swim",text:"Incline Bench Smith: 2x failure\nChest Flyes: 2x\nT-Bar Rows: 2x\nWeighted Pullups: 2x\nShrugs: 2x\nTricep Ext: 3x\nPreacher + Curls: 4x\nLateral Raises: 3x\nFarmer Carries: 2x\n[Swim 1: 45m Drills]"},
    {id:"2",title:"Day 2: Legs (Hams/Glutes)",text:"Stiff Legged Deadlifts (RDL): 3x failure\nGlute Squats/Bridges: 2x\nHamstring Curls: 2x\nHip Adduction: 2x\nAbs Core Setup: 2x\n[NO CARDIO RECOVERY]"},
    {id:"3",title:"Day 3: Aerobic Flush",text:"[Bike Z2 Spin: 60m @ 85-90 RPM]\n[Run Easy Base: 30m]"},
    {id:"4",title:"Day 4: Upper Repeat",text:"Incline Bench Smith: 2x failure\nChest Flyes: 2x\nT-Bar Rows: 2x\nWeighted Pullups: 2x\nShrugs: 2x\nTricep Ext: 3x\nPreacher + Curls: 4x\nLateral Raises: 3x\nFarmer Carries: 2x\n[Swim 2: 45m Laps]"},
    {id:"5",title:"Day 5: Legs (Quads/Calf)",text:"Pendulum Squat: 3x failure\nQuad Extensions: 2x\nHip Abduction: 2x\nCalf Raises: 2x\nAbs Core Setup: 2x"},
    {id:"6",title:"Day 6: Metabolic Clearance",text:"[Run: 30-45m Slow Flush Jog]"},
    {id:"7",title:"Day 7: Endurance Peak",text:"[Long Bike: Z2 Aero position]\n[Long Run: Z2 Conversational]"},
    {id:"8",title:"Day 8: Systemic Reset",text:"[TOTAL REST - CNS DOWNREGULATION]"}
];

/* ── SHARED UTILITIES ─────────────────────────────────────── */
function escH(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function ordinal(n) {
    const v = n % 100;
    const s = ['th','st','nd','rd'];
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtDateLong(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${months[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
}

function fmtDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const todayMid = new Date(_today.getFullYear(), _today.getMonth(), _today.getDate());
    const dMid     = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((todayMid - dMid) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    const yearSuffix = d.getFullYear() !== _today.getFullYear() ? ` ${d.getFullYear()}` : '';
    return `${dow}, ${mon} ${d.getDate()}${yearSuffix}`;
}

function getTodayStr() {
    return `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
}

/* ── EXERCISE DATA HELPERS ────────────────────────────────── */
function parseEx(raw) {
    if (!raw) return [];
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
    catch { return raw.split('\n').filter(l=>l.trim()).map(l=>({k:'text',n:l})); }
}

function serializeEx(arr) { return arr.length ? JSON.stringify(arr) : ''; }

function normalizeLift(e) {
    if (e.sets && Array.isArray(e.sets)) return e;
    const count = parseInt(e.s) || 1;
    const sets = Array.from({length: count}, () => ({r: String(e.r||'1'), w: String(e.w||'')}));
    return {...e, sets};
}

function fmtSets(sets) {
    if (!sets || !sets.length) return '—';
    const n = sets.length;
    const allSameReps   = sets.every(s => s.r === sets[0].r);
    const allSameWeight = sets.every(s => s.w === sets[0].w);
    if (allSameReps && allSameWeight) {
        return `<span style="font-size:15px;font-weight:800;color:#f0f0f0">${n}×${sets[0].r||'—'}</span>${sets[0].w ? ' <span style="font-size:11px;font-weight:500;color:rgba(180,190,255,0.45)">@ '+escH(sets[0].w)+'</span>' : ''}`;
    }
    const chips = sets.map((s,i) =>
        `<span class="set-chip"><span class="set-chip-n">S${i+1}</span><span class="set-reps">${s.r||'—'}</span>${s.w?`<span class="set-chip-wt">@ ${escH(s.w)}</span>`:''}</span>`
    ).join('');
    return `<span class="set-count-lbl">${n} sets</span>${chips}`;
}

function buildCellSummary(raw) {
    if (!raw) return '';
    const arr = parseEx(raw);
    if (!arr.length) return raw;
    return arr.map(e => {
        if (e.k === 'lift') {
            const entry = normalizeLift(e);
            const n = entry.sets ? entry.sets.length : (e.s||'');
            const r = entry.sets ? (entry.sets[0]?.r||'') : (e.r||'');
            return `${entry.n}${n&&r ? ' '+n+'×'+r : ''}`;
        }
        if (e.k === 'swim') return `Swim${e.v1?' '+e.v1+'min':''}`;
        if (e.k === 'run')  return `Run${e.v1?' '+e.v1+'mi':''}`;
        if (e.k === 'bike') return `Bike${e.v1?' '+e.v1+'mi':''}`;
        return e.n || '';
    }).filter(Boolean).join('\n');
}

/* ── EXERCISE USAGE TRACKING ──────────────────────────────── */
function getUsage() {
    try { return JSON.parse(localStorage.getItem('queExerciseUsage')) || {}; } catch { return {}; }
}

function bumpUsage(group, name) {
    const u = getUsage();
    if (!u[group]) u[group] = {};
    u[group][name] = (u[group][name] || 0) + 1;
    localStorage.setItem('queExerciseUsage', JSON.stringify(u));
}

/* ── LOCAL STORAGE — READ / WRITE ─────────────────────────── */
function syncActiveDayToMemory(refresh=false) {
    if (!activeDayFocusString) return;
    localDBInstance[activeDayFocusString] = {
        ...(localDBInstance[activeDayFocusString] || {}),
        steps:    document.getElementById('inSteps').value,
        runDist:  document.getElementById('inRunDist').value,
        runTime:  document.getElementById('inRunTime').value,
        bikeDist: document.getElementById('inBikeDist').value,
        bikeTime: document.getElementById('inBikeTime').value,
        swimTime: document.getElementById('inSwimTime').value,
        exercises:document.getElementById('inDayExercises').value,
        notes:    document.getElementById('inDayNotes').value,
        weight:   document.getElementById('bioWeight').value,
        burn:     lastBurn,
        budget:   lastBudget
    };
    localStorage.setItem('ironmanCoreDB_v2', JSON.stringify(localDBInstance));
    if (refresh) { renderActiveViewLayout(); buildDailyLog(); buildDayWorkoutSummary(activeDayFocusString); }
    const ind = document.getElementById('saveIndicator');
    if (ind) {
        ind.classList.add('show');
        clearTimeout(ind._t);
        ind._t = setTimeout(() => ind.classList.remove('show'), 2000);
    }
}

function loadTargetDayFromMemory(dateStr) {
    const d = localDBInstance[dateStr] || {};
    document.getElementById('inSteps').value    = d.steps    || 0;
    document.getElementById('inRunDist').value  = d.runDist  || 0;
    document.getElementById('inRunTime').value  = d.runTime  || 0;
    document.getElementById('inBikeDist').value = d.bikeDist || 0;
    document.getElementById('inBikeTime').value = d.bikeTime || 0;
    document.getElementById('inSwimTime').value = d.swimTime || 0;
    document.getElementById('inDayExercises').value = d.exercises || '';
    document.getElementById('inDayNotes').value     = d.notes     || '';
    const arr = parseEx(d.exercises || '');
    const hasLogCardio = arr.some(e => ['run','bike','swim'].includes(e.k));
    if (hasLogCardio) {
        syncCardioToMetabolic(arr);
    } else {
        syncHiddenToMet();
        calculateActiveMetrics();
    }
    renderWorkoutLog();
}

function getLastKnownWeight(dateStr) {
    const hit = Object.keys(localDBInstance)
        .filter(ds => ds <= dateStr && localDBInstance[ds].weight)
        .sort((a, b) => b.localeCompare(a))[0];
    return hit ? localDBInstance[hit].weight : '';
}

function updateDayCalsEaten(dateStr, val) {
    if (!localDBInstance[dateStr]) localDBInstance[dateStr] = {exercises:'',notes:'',burn:0,budget:0};
    localDBInstance[dateStr].calsEaten = val;
    localStorage.setItem('ironmanCoreDB_v2', JSON.stringify(localDBInstance));
    const badge  = document.querySelector(`[data-net-badge="${dateStr}"]`);
    const budget = parseFloat(localDBInstance[dateStr].budget) || 0;
    const eaten  = parseFloat(val) || 0;
    if (badge) {
        if (val && budget) {
            const net = Math.round(eaten - budget);
            badge.className = `diary-net ${net <= 0 ? 'net-under' : 'net-over'}`;
            badge.textContent = (net > 0 ? '+' : '') + net.toLocaleString() + ' kcal';
        } else {
            badge.className = 'diary-net net-none';
            badge.textContent = '—';
        }
    }
    if (document.getElementById('pageMetabolics').classList.contains('active')) {
        buildProjectionGraph();
    }
}

function updateDayNotes(dateStr, val) {
    if (!localDBInstance[dateStr]) localDBInstance[dateStr] = {exercises:'',notes:'',burn:0,budget:0};
    localDBInstance[dateStr].notes = val;
    localStorage.setItem('ironmanCoreDB_v2', JSON.stringify(localDBInstance));
}

function updateDayWeight(dateStr, val) {
    if (!localDBInstance[dateStr]) localDBInstance[dateStr] = {steps:0,runDist:0,runTime:0,bikeDist:0,bikeTime:0,swimTime:0,exercises:'',notes:'',burn:0,budget:0};
    localDBInstance[dateStr].weight = val;
    localStorage.setItem('ironmanCoreDB_v2', JSON.stringify(localDBInstance));
    const todayStr = getTodayStr();
    if (dateStr === todayStr && val) {
        document.getElementById('bioWeight').value = val;
        calculateActiveMetrics();
    }
}

function updateMetTodayWeight(val) { updateDayWeight(getTodayStr(), val); }
function updateMetTodayCals(val)   { updateDayCalsEaten(getTodayStr(), val); }

/* ── PAGE NAVIGATION ──────────────────────────────────────── */
function showPage(id, idx) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    for (let i = 0; i < 3; i++) {
        document.getElementById(`tnBtn${i}`).classList.toggle('active', i === idx);
        document.getElementById(`bnBtn${i}`).classList.toggle('active', i === idx);
    }
    if (id === 'pageMetabolics') {
        document.getElementById('metabolicActiveDateText').innerText = fmtDateLong(activeDayFocusString);
        syncHiddenToMet();
        buildDailyLog();
        _updateCalHistCard();
        buildTrendCharts('weight');
    }
}

/* ── STARFIELD ────────────────────────────────────────────── */
function initStarfield() {
    const canvas = document.getElementById('starfieldCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = canvas.width  = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    const stars = Array.from({length: 220}, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.2,
        a: Math.random() * 0.7 + 0.1,
        s: Math.random() * 0.005 + 0.002,
        p: Math.random() * Math.PI * 2,
    }));

    let t = 0;
    (function draw() {
        ctx.clearRect(0, 0, w, h);
        t += 0.016;
        for (const s of stars) {
            const op = s.a * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.s * 50 + s.p)));
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,' + op.toFixed(2) + ')';
            ctx.fill();
        }
        requestAnimationFrame(draw);
    })();

    window.addEventListener('resize', () => {
        w = canvas.width  = window.innerWidth;
        h = canvas.height = window.innerHeight;
        stars.forEach(s => { s.x = Math.random() * w; s.y = Math.random() * h; });
    });
}

/* ── BOOTSTRAPPER ─────────────────────────────────────────── */
function bootstrapper() {
    initNavSelectors();
    populateExerciseSelect();
    window.addEventListener('resize', renderActiveViewLayout);

    const _savedProfile = localStorage.getItem('ironmanProfileSettings_v2');
    if (_savedProfile) {
        try {
            const p = JSON.parse(_savedProfile);
            if (p.w) document.getElementById('bioWeight').value   = p.w;
            if (p.h) document.getElementById('bioHeight').value   = p.h;
            if (p.a) document.getElementById('bioAge').value      = p.a;
            if (p.s) document.getElementById('bioSex').value      = p.s;
            if (p.b) document.getElementById('deficitBase').value = p.b;
            if (p.l) document.getElementById('actLevel').value    = p.l;
        } catch(e) { /* corrupted localStorage — fall through to defaults */ }
    }
    localStorage.setItem('ironmanProfileSettings_v2', JSON.stringify({
        w: document.getElementById('bioWeight').value,
        h: document.getElementById('bioHeight').value,
        a: document.getElementById('bioAge').value,
        s: document.getElementById('bioSex').value,
        b: document.getElementById('deficitBase').value,
        l: document.getElementById('actLevel').value
    }));
    calculateActiveMetrics();

    const db = localStorage.getItem('ironmanCoreDB_v2');
    if (db) localDBInstance = JSON.parse(db);

    document.getElementById('selectMonth').value = currentDisplayDate.getMonth();
    document.getElementById('selectYear').value  = currentDisplayDate.getFullYear();

    ['repsInput','customExInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', ev => { if(ev.key==='Enter'){ev.preventDefault();commitAddLift();} });
    });

    if (window.innerWidth <= 768) activeViewMode = 'week';
    updateCalMobileTitle();
    document.getElementById('metabolicActiveDateText').innerText = fmtDateLong(activeDayFocusString);

    buildWorkoutPool();
    renderSetRows();
    initGroupPillsScroll();
    renderActiveViewLayout();
    focusCalendarDay(activeDayFocusString);
    syncHiddenToMet();
    buildDailyLog();
    requestAnimationFrame(() => buildTrendCharts('weight'));
}

window.onload = bootstrapper;
initStarfield();
