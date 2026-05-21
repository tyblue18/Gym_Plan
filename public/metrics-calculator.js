/* ============================================================
   metrics-calculator.js — Que fitness tracker
   Mifflin-St Jeor BMR/TDEE engine, cardio eat-back formula,
   weight projection graph, calorie history modal, trend charts,
   activity log, and metabolic form sync.
   Depends on: app-state.js
   ============================================================ */

/* ── PROFILE PANEL ────────────────────────────────────────── */
function toggleProfilePanel() {
    const panel = document.getElementById('profilePanel');
    const btn   = document.getElementById('profileIconBtn');
    const open  = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = open ? 'block' : 'none';
    btn.classList.toggle('active', open);
}

/* ── METABOLIC FORM SYNC ──────────────────────────────────── */
function syncMetToHidden() {
    document.getElementById('inSteps').value    = document.getElementById('metSteps').value;
    document.getElementById('inRunDist').value  = document.getElementById('metRunDist').value;
    document.getElementById('inRunTime').value  = document.getElementById('metRunTime').value;
    document.getElementById('inBikeDist').value = document.getElementById('metBikeDist').value;
    document.getElementById('inBikeTime').value = document.getElementById('metBikeTime').value;
    document.getElementById('inSwimTime').value = document.getElementById('metSwimTime').value;
}

function syncHiddenToMet() {
    document.getElementById('metSteps').value    = document.getElementById('inSteps').value;
    document.getElementById('metRunDist').value  = document.getElementById('inRunDist').value;
    document.getElementById('metRunTime').value  = document.getElementById('inRunTime').value;
    document.getElementById('metBikeDist').value = document.getElementById('inBikeDist').value;
    document.getElementById('metBikeTime').value = document.getElementById('inBikeTime').value;
    document.getElementById('metSwimTime').value = document.getElementById('inSwimTime').value;

    const todayStr  = getTodayStr();
    const todayData = localDBInstance[todayStr] || {};
    const wtEl  = document.getElementById('metTodayWeight');
    const calEl = document.getElementById('metTodayCals');
    const lblEl = document.getElementById('metTodayDateLabel');
    if (wtEl)  wtEl.value  = todayData.weight    || getLastKnownWeight(todayStr) || '';
    if (calEl) calEl.value = todayData.calsEaten || '';
    if (lblEl) lblEl.textContent = fmtDateLong(todayStr);
}

function syncCardioToMetabolic(arr) {
    const runs  = arr.filter(e => e.k === 'run');
    const bikes = arr.filter(e => e.k === 'bike');
    const swims = arr.filter(e => e.k === 'swim');
    const set = (id, v) => { document.getElementById(id).value = v || 0; };
    set('inRunDist',  runs.reduce((s,e)  => s + (parseFloat(e.v1)||0), 0).toFixed(2));
    set('inRunTime',  runs.reduce((s,e)  => s + (parseFloat(e.v2)||0), 0));
    set('inBikeDist', bikes.reduce((s,e) => s + (parseFloat(e.v1)||0), 0).toFixed(2));
    set('inBikeTime', bikes.reduce((s,e) => s + (parseFloat(e.v2)||0), 0));
    set('inSwimTime', swims.reduce((s,e) => s + (parseFloat(e.v1)||0), 0));
    syncHiddenToMet();
    calculateActiveMetrics();
}

/* ── MIFFLIN-ST JEOR BMR + TDEE + DEFICIT ENGINE ─────────── */
function calculateActiveMetrics() {
    const wLbs = parseFloat(document.getElementById('bioWeight').value)  || 180;
    const hIn  = parseFloat(document.getElementById('bioHeight').value)  || 70;
    const age  = parseFloat(document.getElementById('bioAge').value)     || 29;
    const sex  = document.getElementById('bioSex').value;
    const def  = parseFloat(document.getElementById('deficitBase').value)|| 500;
    const mult = parseFloat(document.getElementById('actLevel').value)   || 1.55;
    const kg   = wLbs / 2.20462;
    const cm   = hIn  * 2.54;

    // BMR — Mifflin-St Jeor equation
    const bmr  = Math.round(sex === 'male'
        ? (10*kg + 6.25*cm - 5*age + 5)
        : (10*kg + 6.25*cm - 5*age - 161));
    // TDEE = BMR × activity multiplier
    const tdee = Math.round(bmr * mult);

    const g = id => document.getElementById(id);
    if (g('outCalculatedBMR')) g('outCalculatedBMR').innerText = `${bmr.toLocaleString()} kcal`;
    if (g('outActMult'))        g('outActMult').innerText       = `× ${mult}`;
    if (g('outTDEE'))           g('outTDEE').innerText          = `${tdee.toLocaleString()} kcal`;
    if (g('outDeficitLine'))    g('outDeficitLine').innerText   = `−${def.toLocaleString()} kcal`;

    // Steps (NEAT — baked into activity multiplier, shown for reference only)
    const steps  = parseFloat(g('inSteps').value) || 0;
    const stride = hIn * (sex === 'male' ? 0.418 : 0.415);
    const stepMi = (steps * stride) / 63360;
    if (g('outStepCalc')) g('outStepCalc').innerText = `Distance: ${stepMi.toFixed(2)} mi`;
    const stepBurn = Math.round(stepMi * 0.57 * wLbs);
    if (g('outStepBurn')) g('outStepBurn').innerText = stepBurn > 0 ? `${stepBurn} kcal` : '— kcal';

    // Running — MET-based burn
    const rMi  = parseFloat(g('inRunDist').value) || 0;
    const rMin = parseFloat(g('inRunTime').value) || 0;
    let runBurn = 0;
    if (rMi > 0 && rMin > 0) {
        const mph  = (rMi / rMin) * 60;
        const pace = rMin / rMi;
        const pMin = Math.floor(pace);
        const pSec = Math.round((pace - pMin) * 60).toString().padStart(2, '0');
        let met = 6;
        if (mph >= 9) met = 12.8; else if (mph >= 8) met = 11.8;
        else if (mph >= 7) met = 11; else if (mph >= 6) met = 9.8; else if (mph >= 5) met = 9;
        runBurn = met * 3.5 * kg / 200 * rMin;
        if (g('outRunPace')) g('outRunPace').innerText = `Pace: ${pMin}:${pSec} /mi  ·  ${Math.round(runBurn)} kcal`;
    } else {
        if (g('outRunPace')) g('outRunPace').innerText = 'Pace: — /mi';
    }
    if (g('outRunBurnTile')) g('outRunBurnTile').innerText = runBurn > 0 ? `${Math.round(runBurn)} kcal` : '— kcal';

    // Cycling — MET-based burn
    const bMi  = parseFloat(g('inBikeDist').value) || 0;
    const bMin = parseFloat(g('inBikeTime').value) || 0;
    let bikeBurn = 0;
    if (bMi > 0 && bMin > 0) {
        const mph = (bMi / bMin) * 60;
        let met = 4;
        if (mph >= 20) met = 15; else if (mph >= 16) met = 12;
        else if (mph >= 14) met = 10; else if (mph >= 12) met = 8; else if (mph >= 10) met = 6;
        bikeBurn = met * 3.5 * kg / 200 * bMin;
        if (g('outBikeSpeed')) g('outBikeSpeed').innerText = `Speed: ${mph.toFixed(1)} mph  ·  ${Math.round(bikeBurn)} kcal`;
    } else {
        if (g('outBikeSpeed')) g('outBikeSpeed').innerText = 'Speed: — mph';
    }
    if (g('outBikeBurnTile')) g('outBikeBurnTile').innerText = bikeBurn > 0 ? `${Math.round(bikeBurn)} kcal` : '— kcal';

    // Swimming — MET 6.0 general/drills
    const sMin     = parseFloat(g('inSwimTime').value) || 0;
    const swimBurn = sMin > 0 ? 6.0 * 3.5 * kg / 200 * sMin : 0;
    if (g('outSwimBurn'))     g('outSwimBurn').innerText     = sMin > 0 ? `${sMin} min  ·  ${Math.round(swimBurn)} kcal burned` : 'Burn: — kcal';
    if (g('outSwimBurnTile')) g('outSwimBurnTile').innerText = swimBurn > 0 ? `${Math.round(swimBurn)} kcal` : '— kcal';

    // Food budget: TDEE − Deficit + 60% cardio eat-back
    const activityBurn = Math.round(runBurn + bikeBurn + swimBurn);
    const eatBack      = Math.round(activityBurn * 0.60);
    const budget       = Math.max(0, (tdee - def) + eatBack);

    if (g('outBurn'))          g('outBurn').innerText          = `${activityBurn} kcal`;
    if (g('outTotalBurnLine')) g('outTotalBurnLine').innerText = activityBurn > 0 ? `${activityBurn} kcal` : '— kcal';
    if (g('outEatBack'))       g('outEatBack').innerText       = eatBack > 0 ? `+${eatBack} kcal` : '+0 kcal';
    if (g('outNetBudget'))     g('outNetBudget').innerText     = `${budget.toLocaleString()} kcal`;
    if (g('budgetHeroSub'))    g('budgetHeroSub').innerText    = `(${tdee.toLocaleString()} − ${def.toLocaleString()}${eatBack > 0 ? ' + '+eatBack : ''} = ${budget.toLocaleString()} kcal)`;

    lastBurn = activityBurn;
    lastBudget = budget;
}

function runGlobalRecalculation() {
    calculateActiveMetrics();
    localStorage.setItem('ironmanProfileSettings_v2', JSON.stringify({
        w: document.getElementById('bioWeight').value,
        h: document.getElementById('bioHeight').value,
        a: document.getElementById('bioAge').value,
        s: document.getElementById('bioSex').value,
        b: document.getElementById('deficitBase').value,
        l: document.getElementById('actLevel').value
    }));
    const badge = document.getElementById('profileSavedBadge');
    if (badge) {
        badge.classList.add('show');
        clearTimeout(badge._t);
        badge._t = setTimeout(() => badge.classList.remove('show'), 1800);
    }
    const todayStr = getTodayStr();
    const wVal = document.getElementById('bioWeight').value;
    if (wVal) {
        if (!localDBInstance[todayStr]) localDBInstance[todayStr] = {exercises:'',notes:'',burn:0,budget:0};
        localDBInstance[todayStr].weight = wVal;
    }
    if (localDBInstance[activeDayFocusString]) {
        localDBInstance[activeDayFocusString].burn   = lastBurn;
        localDBInstance[activeDayFocusString].budget = lastBudget;
    }
    localStorage.setItem('ironmanCoreDB_v2', JSON.stringify(localDBInstance));
    buildDailyLog();
}

function clearDayWorkout() {
    if (!confirm(`Clear all workout & cardio data for ${activeDayFocusString}?`)) return;
    document.getElementById('inDayExercises').value = '';
    document.getElementById('inDayNotes').value = '';
    ['inSteps','inRunDist','inRunTime','inBikeDist','inBikeTime','inSwimTime'].forEach(id => {
        document.getElementById(id).value = 0;
    });
    if (localDBInstance[activeDayFocusString]) {
        Object.assign(localDBInstance[activeDayFocusString], {
            exercises:'', notes:'', steps:0, runDist:0, runTime:0,
            bikeDist:0, bikeTime:0, swimTime:0, burn:0, budget:0
        });
        localStorage.setItem('ironmanCoreDB_v2', JSON.stringify(localDBInstance));
    }
    syncHiddenToMet();
    renderWorkoutLog();
    calculateActiveMetrics();
    renderActiveViewLayout();
    buildDailyLog();
}

function logTodayAndShowProjection() {
    syncActiveDayToMemory();
    const card = document.getElementById('projectionCard');
    if (card) card.style.display = '';
    showPage('pageMetabolics', 1);
    setTimeout(() => {
        buildProjectionGraph();
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
}

/* ── WEIGHT PROJECTION ────────────────────────────────────── */
let _proj = null;

function buildProjectionGraph() {
    const todayStr = getTodayStr();
    const data    = localDBInstance[todayStr] || {};
    const eaten   = parseFloat(data.calsEaten) || 0;
    const budget  = parseFloat(data.budget) || parseFloat(lastBudget) || 0;
    const startWt = parseFloat(document.getElementById('bioWeight').value) || 0;

    const emptyEl   = document.getElementById('projectionEmpty');
    const contentEl = document.getElementById('projectionContent');
    if (!emptyEl || !contentEl) return;

    if (!data.calsEaten || !budget || !startWt) {
        emptyEl.style.display = ''; contentEl.style.display = 'none';
        _proj = null; return;
    }
    emptyEl.style.display = 'none'; contentEl.style.display = '';

    // 60% of cardio burn is eaten back; remaining 40% is extra deficit
    const cardioBurn    = parseFloat(data.burn) || lastBurn || 0;
    const uneatenCardio = Math.round(cardioBurn * 0.40);
    const foodNet       = Math.round(eaten - budget);
    const dailyNet      = foodNet - uneatenCardio;
    const lbsPerDay  = dailyNet / 3500;
    const lbsPerWeek = lbsPerDay * 7;
    const col = dailyNet <= 0 ? '#80b99a' : '#d97070';
    const rgb = dailyNet <= 0 ? '128,185,154' : '217,112,112';

    const nEl = document.getElementById('projNetVal');
    if (nEl) {
        nEl.style.color = col;
        nEl.innerHTML = `${dailyNet > 0?'+':''}${dailyNet.toLocaleString()} kcal`
            + (uneatenCardio > 0
                ? `<span style="display:block;font-size:10px;font-weight:500;color:var(--text-muted);margin-top:3px;">food ${foodNet > 0?'+':''}${foodNet.toLocaleString()} · cardio −${uneatenCardio.toLocaleString()}</span>`
                : '');
    }
    const wEl = document.getElementById('projWeekVal');
    if (wEl) { wEl.textContent = `${lbsPerWeek > 0?'+':''}${lbsPerWeek.toFixed(2)} lbs`; wEl.style.color = col; }

    const msEl = document.getElementById('projectionMilestones');
    if (msEl) msEl.innerHTML = [30,60,90,180].map(d => {
        const proj = startWt + lbsPerDay * d;
        const diff = proj - startWt;
        const dc   = diff <= 0 ? '#80b99a' : '#d97070';
        return `<div class="proj-milestone">
            <span class="proj-ms-label">${d} days</span>
            <span class="proj-ms-weight">${proj.toFixed(1)} lbs</span>
            <span class="proj-ms-diff" style="color:${dc}">${diff>0?'+':''}${diff.toFixed(1)} lbs</span>
        </div>`;
    }).join('');

    const canvas = document.getElementById('projectionChart');
    if (!canvas) return;

    const DAYS = 91;
    const pts  = Array.from({length: DAYS}, (_, i) => startWt + lbsPerDay * i);
    const minW = Math.min(...pts), maxW = Math.max(...pts);
    const span = (maxW - minW) || 1;
    const PAD  = {t:20, b:32, l:52, r:16};
    const W = canvas.offsetWidth || 300, H = 200;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;

    const xOf = i => PAD.l + (i / (DAYS - 1)) * (W - PAD.l - PAD.r);
    const yOf = v => H - PAD.b - ((v - minW) / span) * (H - PAD.t - PAD.b);

    _proj = { canvas, pts, xOf, yOf, PAD, W, H, dpr, col, rgb, startWt, DAYS };
    _drawProjection(null);

    if (!canvas._projHoverInit) {
        canvas.addEventListener('mousemove', e => {
            if (!_proj) return;
            const rect = canvas.getBoundingClientRect();
            const mx   = e.clientX - rect.left;
            const day  = Math.round(((mx - _proj.PAD.l) / (_proj.W - _proj.PAD.l - _proj.PAD.r)) * (_proj.DAYS - 1));
            if (day >= 0 && day < _proj.DAYS) _drawProjection(day);
        });
        canvas.addEventListener('mouseleave', () => { if (_proj) _drawProjection(null); });
        canvas._projHoverInit = true;
    }
}

function _drawProjection(hoverDay) {
    if (!_proj) return;
    const {canvas, pts, xOf, yOf, PAD, W, H, dpr, col, rgb, startWt, DAYS} = _proj;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Week grid lines (13 weeks total)
    for (let w = 1; w <= 13; w++) {
        const d = w * 7;
        if (d >= DAYS) break;
        const x = xOf(d);
        const isMajor = w % 4 === 0;
        ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke();
        if (isMajor || w === 1 || w === 13) {
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(`W${w}`, x, H - 10);
        }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('W1', xOf(7), H - 10);

    // Dashed baseline at start weight
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(PAD.l, yOf(startWt)); ctx.lineTo(W - PAD.r, yOf(startWt)); ctx.stroke();
    ctx.setLineDash([]);

    // Y-axis labels
    [startWt, pts[DAYS - 1]].forEach(v => {
        ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(`${v.toFixed(1)}`, PAD.l - 4, yOf(v) + 3);
    });

    // Gradient fill under line
    const grad = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
    grad.addColorStop(0, `rgba(${rgb},0.18)`); grad.addColorStop(1, `rgba(${rgb},0)`);
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(pts[0]));
    pts.forEach((v,i) => ctx.lineTo(xOf(i), yOf(v)));
    ctx.lineTo(xOf(DAYS-1), H-PAD.b); ctx.lineTo(xOf(0), H-PAD.b); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Projection line
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(pts[0]));
    pts.forEach((v,i) => ctx.lineTo(xOf(i), yOf(v)));
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

    // Today dot + label
    ctx.beginPath(); ctx.arc(xOf(0), yOf(pts[0]), 4, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Today', xOf(0) + 7, yOf(pts[0]) - 4);

    // Hover crosshair + tooltip
    if (hoverDay !== null && hoverDay < DAYS) {
        const hx = xOf(hoverDay);
        const hy = yOf(pts[hoverDay]);
        const week = Math.ceil(hoverDay / 7) || 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(hx, PAD.t); ctx.lineTo(hx, H - PAD.b); ctx.stroke();
        ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI*2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI*2);
        ctx.fillStyle = col; ctx.fill();
        const label = hoverDay === 0 ? 'Today' : `Day ${hoverDay} · W${week}`;
        const wt    = `${pts[hoverDay].toFixed(1)} lbs`;
        const diff  = pts[hoverDay] - startWt;
        const ds    = `${diff > 0?'+':''}${diff.toFixed(1)} lbs`;
        const text  = `${label} — ${wt} (${ds})`;
        ctx.font = '11px system-ui,sans-serif';
        const tw = ctx.measureText(text).width + 20;
        const th = 26;
        const tx = Math.min(hx + 10, W - PAD.r - tw);
        const ty = Math.max(PAD.t, hy - th - 6);
        ctx.fillStyle = 'rgba(17,17,17,0.92)';
        ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 5); ctx.fill();
        ctx.fillStyle = '#f0f0f0'; ctx.textAlign = 'left';
        ctx.fillText(text, tx + 10, ty + 17);
    }
}

/* ── CALORIE HISTORY MODAL ────────────────────────────────── */
function _calcStreak(data) {
    if (!data.length) return 0;
    const logged   = new Set(data.map(d => d.ds));
    const todayStr = getTodayStr();
    const cur = new Date(_today.getFullYear(), _today.getMonth(), _today.getDate());
    if (!logged.has(todayStr)) cur.setDate(cur.getDate() - 1);
    let streak = 0;
    while (true) {
        const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
        if (!logged.has(ds)) break;
        streak++;
        cur.setDate(cur.getDate() - 1);
    }
    return streak;
}

function _getCalData() {
    return Object.keys(localDBInstance).sort().map(ds => {
        const d = localDBInstance[ds];
        if (!d.calsEaten) return null;
        const eaten  = parseFloat(d.calsEaten) || 0;
        const budget = parseFloat(d.budget)    || 0;
        return { ds, eaten, budget, net: eaten - budget };
    }).filter(d => d && d.eaten > 0);
}

function _updateCalHistCard() {
    const data   = _getCalData();
    const streak = _calcStreak(data);
    const last   = parseInt(localStorage.getItem('queLastStreak') ?? '-1');
    const cardEl = document.getElementById('calHistCardStreak');
    const numEl  = document.getElementById('calHistCardStreakNum');

    if (streak > 0) {
        if (cardEl) cardEl.style.display = '';
        if (numEl)  numEl.textContent = streak;
        if (streak !== last && cardEl) {
            cardEl.classList.remove('streak-anim-pop', 'streak-anim-lost');
            void cardEl.offsetWidth;
            cardEl.classList.add('streak-anim-pop');
        }
    } else if (last > 0) {
        if (cardEl && numEl) {
            numEl.textContent = last;
            cardEl.style.display = '';
            cardEl.classList.remove('streak-anim-pop', 'streak-anim-lost');
            void cardEl.offsetWidth;
            cardEl.classList.add('streak-anim-lost');
            setTimeout(() => { if (cardEl) cardEl.style.display = 'none'; }, 1400);
        }
    } else {
        if (cardEl) cardEl.style.display = 'none';
    }

    const summaryEl = document.getElementById('calHistSummary');
    if (summaryEl && data.length) {
        const avg = data.reduce((s,d) => s+d.net, 0) / data.length;
        const c   = avg <= 0 ? '#80b99a' : '#d97070';
        summaryEl.innerHTML = `${data.length} days logged &middot; avg <span style="color:${c};font-weight:600">${avg>0?'+':''}${Math.round(avg).toLocaleString()} kcal/day</span>`;
    }

    localStorage.setItem('queLastStreak', streak);
    return { data, streak };
}

function openCalHistory() {
    const data   = _getCalData();
    const streak = _calcStreak(data);
    const bannerEl = document.getElementById('calHistStreakBanner');
    if (bannerEl) {
        if (streak > 0) {
            const sub = streak === 1 ? 'Log again tomorrow to continue' : `${streak} consecutive days logged`;
            bannerEl.innerHTML = `<div class="streak-banner">
                <span class="streak-num">${streak}</span>
                <div class="streak-info">
                    <span class="streak-label">Day Streak</span>
                    <span class="streak-sub">${sub}</span>
                </div>
            </div>`;
            bannerEl.style.display = '';
        } else {
            bannerEl.style.display = 'none';
        }
    }
    document.getElementById('calHistModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    const firstTab = document.querySelector('#calHistModalTabs .chart-tab');
    switchCalHistTab('list', firstTab);
}

function closeCalHistory() {
    document.getElementById('calHistModal').classList.remove('open');
    document.body.style.overflow = '';
}

function handleCalHistBgClick(e) {
    if (e.target === document.getElementById('calHistModal')) closeCalHistory();
}

function switchCalHistTab(tab, btn) {
    document.querySelectorAll('#calHistModalTabs .chart-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const data = _getCalData();
    const el   = document.getElementById('calHistModalContent');
    if (!data.length) {
        el.innerHTML = '<div class="proj-no-data">No calorie data yet — log calories eaten on daily entries.</div>';
        return;
    }
    if (tab === 'list')         _calHistList(data, el);
    else if (tab === 'weekly')  _calHistPeriod(data, el, 'weekly');
    else if (tab === 'monthly') _calHistPeriod(data, el, 'monthly');
    else                        _calHistAllTime(data, el);
}

function _calHistList(data, el) {
    const rows = [...data].reverse().map(d => {
        const dt = new Date(d.ds+'T00:00:00');
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        const dd = String(dt.getDate()).padStart(2,'0');
        const yy = String(dt.getFullYear()).slice(2);
        const nc = d.net<=0 ? '#80b99a' : '#d97070';
        const ns = (d.net>0?'+':'')+Math.round(d.net).toLocaleString();
        return `<div class="cal-hist-row">
            <span class="cal-date">${mm}/${dd}/${yy}</span>
            <span class="cal-eaten">${d.eaten.toLocaleString()} kcal</span>
            <span class="cal-net" style="color:${nc}">${ns} kcal</span>
        </div>`;
    }).join('');
    el.innerHTML = `<div class="cal-hist-list-hdr"><span>Date</span><span>Eaten</span><span style="text-align:right">Net</span></div>${rows}`;
}

function _calHistPeriod(data, el, mode) {
    const groups = {};
    data.forEach(d => {
        const dt = new Date(d.ds+'T00:00:00');
        let key;
        if (mode === 'weekly') {
            const day = dt.getDay();
            const mon = new Date(dt); mon.setDate(dt.getDate() - (day===0?6:day-1));
            key = mon.toISOString().slice(0,10);
        } else {
            key = d.ds.slice(0,7);
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
    });

    const periods = Object.keys(groups).sort().map(k => {
        const days = groups[k];
        const avgE = days.reduce((s,d)=>s+d.eaten,0)/days.length;
        const bd   = days.filter(d=>d.budget>0);
        const avgB = bd.length ? bd.reduce((s,d)=>s+d.budget,0)/bd.length : 0;
        const avgN = days.reduce((s,d)=>s+d.net,0)/days.length;
        return { key: k, avgE, avgB, avgN, count: days.length };
    });

    const fmtK = k => {
        if (mode === 'weekly') {
            const dt = new Date(k+'T00:00:00');
            return `${dt.getMonth()+1}/${dt.getDate()}`;
        }
        const [y,m] = k.split('-');
        return `${'JanFebMarAprMayJunJulAugSepOctNovDec'.slice((+m-1)*3,(+m-1)*3+3)} '${y.slice(2)}`;
    };

    const tableRows = [...periods].reverse().map(p => {
        const nc = p.avgN<=0 ? '#80b99a' : '#d97070';
        return `<div class="cal-hist-row four-col">
            <span class="cal-date">${fmtK(p.key)}</span>
            <span class="cal-eaten">${Math.round(p.avgE).toLocaleString()}</span>
            <span class="cal-net" style="color:${nc}">${p.avgN>0?'+':''}${Math.round(p.avgN).toLocaleString()}</span>
            <span class="cal-sub">${p.count}d</span>
        </div>`;
    }).join('');

    el.innerHTML = `
        <canvas id="chPeriodEat" class="trend-canvas"></canvas>
        <div style="display:flex;gap:16px;margin-top:8px;margin-bottom:20px;align-items:center;">
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted);"><span style="width:12px;height:2px;background:#e8e8e8;display:inline-block;border-radius:1px;"></span>Avg Eaten</span>
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted);"><span style="width:12px;border-top:2px dashed rgba(255,255,255,0.30);display:inline-block;"></span>Avg Budget</span>
        </div>
        <h3 style="margin-bottom:10px;">Net per ${mode==='weekly'?'Week':'Month'}</h3>
        <canvas id="chPeriodNet" class="trend-canvas" style="margin-bottom:20px;"></canvas>
        <div class="cal-hist-list-hdr four-col"><span>${mode==='weekly'?'Week of':'Month'}</span><span>Avg Eaten</span><span style="text-align:right">Avg Net</span><span style="text-align:right">Days</span></div>
        ${tableRows}`;

    requestAnimationFrame(() => {
        _drawEatLine('chPeriodEat', periods.map(p => ({eaten:p.avgE, budget:p.avgB, label:fmtK(p.key)})));
        _drawNetBars('chPeriodNet', periods.map(p => ({net:p.avgN, label:fmtK(p.key)})));
    });
}

function _calHistAllTime(data, el) {
    const avgE = data.reduce((s,d)=>s+d.eaten,0)/data.length;
    const bd   = data.filter(d=>d.budget>0);
    const avgB = bd.length ? bd.reduce((s,d)=>s+d.budget,0)/bd.length : 0;
    const avgN = data.reduce((s,d)=>s+d.net,0)/data.length;
    const unc  = data.filter(d=>d.net<=0).length;
    const nc   = avgN<=0 ? '#80b99a' : '#d97070';

    el.innerHTML = `
        <div class="stat-tiles" style="margin-bottom:18px;">
            <div class="stat-tile"><div class="stat-tile-lbl">Avg Eaten</div><div class="stat-tile-val">${Math.round(avgE).toLocaleString()}</div></div>
            <div class="stat-tile"><div class="stat-tile-lbl">Avg Budget</div><div class="stat-tile-val">${avgB?Math.round(avgB).toLocaleString():'—'}</div></div>
            <div class="stat-tile"><div class="stat-tile-lbl">Avg Net</div><div class="stat-tile-val" style="color:${nc}">${avgN>0?'+':''}${Math.round(avgN).toLocaleString()}</div></div>
            <div class="stat-tile"><div class="stat-tile-lbl">Under Budget</div><div class="stat-tile-val" style="color:#80b99a">${unc}<span style="font-size:13px;color:var(--text-muted)"> / ${data.length}</span></div></div>
        </div>
        <canvas id="chAllEat" class="trend-canvas"></canvas>
        <div style="display:flex;gap:16px;margin-top:8px;margin-bottom:20px;align-items:center;">
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted);"><span style="width:12px;height:2px;background:#e8e8e8;display:inline-block;border-radius:1px;"></span>Eaten</span>
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted);"><span style="width:12px;border-top:2px dashed rgba(255,255,255,0.30);display:inline-block;"></span>Budget</span>
        </div>
        <h3 style="margin-bottom:10px;">Net Calories — All Time</h3>
        <canvas id="chAllNet" class="trend-canvas"></canvas>`;

    requestAnimationFrame(() => {
        _drawEatLine('chAllEat', data.map(d => ({eaten:d.eaten, budget:d.budget, label:`${new Date(d.ds+'T00:00:00').getMonth()+1}/${new Date(d.ds+'T00:00:00').getDate()}`})));
        _drawNetBars('chAllNet', data.map(d => ({net:d.net, label:`${new Date(d.ds+'T00:00:00').getMonth()+1}/${new Date(d.ds+'T00:00:00').getDate()}`})));
    });
}

/* ── CANVAS CHART HELPERS ─────────────────────────────────── */
function _drawEatLine(id, pts) {
    const canvas = document.getElementById(id); if (!canvas||!pts.length) return;
    const ctx=canvas.getContext('2d'), dpr=window.devicePixelRatio||1;
    const W=canvas.offsetWidth||300, H=160;
    canvas.width=W*dpr; canvas.height=H*dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,W,H);
    const n=pts.length, PAD={t:12,b:28,l:54,r:16};
    const allV=[...pts.map(p=>p.eaten),...pts.filter(p=>p.budget>0).map(p=>p.budget)];
    const minV=Math.min(...allV)*0.92, maxV=Math.max(...allV)*1.05, span=(maxV-minV)||1;
    const xOf=i=>PAD.l+(n===1?(W-PAD.l-PAD.r)/2:(i/(n-1))*(W-PAD.l-PAD.r));
    const yOf=v=>H-PAD.b-((v-minV)/span)*(H-PAD.t-PAD.b);
    [minV,(minV+maxV)/2,maxV].forEach(v=>{ctx.fillStyle='rgba(255,255,255,0.22)';ctx.font='9px system-ui,sans-serif';ctx.textAlign='right';ctx.fillText(Math.round(v).toLocaleString(),PAD.l-4,yOf(v)+3);});
    const step=Math.max(1,Math.ceil(n/6));
    pts.forEach((p,i)=>{if(i%step===0||i===n-1){ctx.fillStyle='rgba(255,255,255,0.25)';ctx.font='9px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(p.label,xOf(i),H-8);}});
    let fb=true; ctx.strokeStyle='rgba(255,255,255,0.22)';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.beginPath();
    pts.forEach((p,i)=>{if(!p.budget){fb=true;return;}if(fb){ctx.moveTo(xOf(i),yOf(p.budget));fb=false;}else ctx.lineTo(xOf(i),yOf(p.budget));});
    ctx.stroke();ctx.setLineDash([]);
    const grad=ctx.createLinearGradient(0,PAD.t,0,H-PAD.b);grad.addColorStop(0,'rgba(255,255,255,0.10)');grad.addColorStop(1,'rgba(255,255,255,0)');
    ctx.beginPath();pts.forEach((p,i)=>{if(i===0)ctx.moveTo(xOf(i),yOf(p.eaten));else ctx.lineTo(xOf(i),yOf(p.eaten));});
    ctx.lineTo(xOf(n-1),H-PAD.b);ctx.lineTo(xOf(0),H-PAD.b);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
    ctx.beginPath();pts.forEach((p,i)=>{if(i===0)ctx.moveTo(xOf(i),yOf(p.eaten));else ctx.lineTo(xOf(i),yOf(p.eaten));});
    ctx.strokeStyle='#e8e8e8';ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
    if(n<=45){pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(xOf(i),yOf(p.eaten),3,0,Math.PI*2);ctx.fillStyle='#e8e8e8';ctx.fill();});}
}

function _drawNetBars(id, pts) {
    const canvas=document.getElementById(id); if(!canvas||!pts.length) return;
    const ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1;
    const W=canvas.offsetWidth||300,H=120;
    canvas.width=W*dpr;canvas.height=H*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
    const n=pts.length,PAD={t:10,b:28,l:54,r:16};
    const maxAbs=Math.max(...pts.map(p=>Math.abs(p.net)))||500;
    const minV=-maxAbs*1.18,maxV=maxAbs*1.18,span=maxV-minV;
    const xOf=i=>PAD.l+(n===1?(W-PAD.l-PAD.r)/2:(i/(n-1))*(W-PAD.l-PAD.r));
    const yOf=v=>H-PAD.b-((v-minV)/span)*(H-PAD.t-PAD.b);
    const y0=yOf(0);
    const half=Math.round(maxAbs/100)*100||100;
    [-half,0,half].forEach(v=>{ctx.fillStyle='rgba(255,255,255,0.22)';ctx.font='9px system-ui,sans-serif';ctx.textAlign='right';ctx.fillText((v>0?'+':'')+v.toLocaleString(),PAD.l-4,yOf(v)+3);});
    ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PAD.l,y0);ctx.lineTo(W-PAD.r,y0);ctx.stroke();
    const step=Math.max(1,Math.ceil(n/6));
    pts.forEach((p,i)=>{if(i%step===0||i===n-1){ctx.fillStyle='rgba(255,255,255,0.25)';ctx.font='9px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(p.label,xOf(i),H-8);}});
    const barW=Math.max(2,Math.min(22,(W-PAD.l-PAD.r)/n-2));
    pts.forEach((p,i)=>{ctx.fillStyle=p.net<=0?'rgba(128,185,154,0.80)':'rgba(217,112,112,0.80)';const bt=Math.min(y0,yOf(p.net)),bh=Math.max(1,Math.abs(y0-yOf(p.net)));ctx.fillRect(xOf(i)-barW/2,bt,barW,bh);});
}

/* ── TREND CHARTS ─────────────────────────────────────────── */
function switchChartTab(key, btn) {
    ['weight','burn','budget'].forEach(k => {
        const p = document.getElementById(`chartPanel${k.charAt(0).toUpperCase()+k.slice(1)}`);
        if (p) p.style.display = k === key ? '' : 'none';
    });
    document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    buildTrendCharts(key);
}

function buildTrendCharts(activeKey) {
    const key     = activeKey || 'weight';
    const allKeys = Object.keys(localDBInstance).sort().slice(-90);
    if (allKeys.length < 2) return;

    const labels     = allKeys.map(ds => { const d = new Date(ds+'T00:00:00'); return `${d.getMonth()+1}/${d.getDate()}`; });
    const weightVals = allKeys.map(ds => parseFloat(localDBInstance[ds]?.weight) || 0);
    const burnVals   = allKeys.map(ds => Number(localDBInstance[ds]?.burn)   || 0);
    const budgetVals = allKeys.map(ds => Number(localDBInstance[ds]?.budget) || 0);

    const charts = {
        weight: { canvasId:'weightChart', data: weightVals, color:'rgb(139,108,247)', unit:' lbs' },
        burn:   { canvasId:'burnChart',   data: burnVals,   color:'rgb(245,166,35)',   unit:' kcal' },
        budget: { canvasId:'budgetChart', data: budgetVals, color:'rgb(79,142,247)',   unit:' kcal' }
    };

    const cfg = charts[key];
    if (!cfg) return;
    const canvas = document.getElementById(cfg.canvasId);
    if (!canvas) return;
    _drawLineChart(canvas, labels, cfg.data, cfg.color, cfg.unit);
}

function _drawLineChart(canvas, labels, values, color, unit) {
    const dpr  = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth || 600;
    const cssH = parseInt(getComputedStyle(canvas).height) || 200;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = cssW, H = cssH;
    const pad = { t:16, r:16, b:36, l:58 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;

    ctx.clearRect(0, 0, W, H);

    const valid = values.filter(v => v > 0);
    if (valid.length < 2) {
        ctx.fillStyle = 'rgba(71,85,105,0.7)';
        ctx.font = '13px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough data — keep logging!', W/2, H/2);
        return;
    }

    const vMin = Math.min(...valid), vMax = Math.max(...valid);
    const pad2 = (vMax - vMin) * 0.12 || vMax * 0.05 || 5;
    const yMin = vMin - pad2, yMax = vMax + pad2;
    const yR   = yMax - yMin;

    const xOf = i => pad.l + (labels.length > 1 ? i / (labels.length-1) : 0.5) * cW;
    const yOf = v => pad.t + (1 - (v - yMin) / yR) * cH;

    // Grid lines
    ctx.strokeStyle = 'rgba(71,85,105,0.2)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.t + (i/4)*cH;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l+cW, y); ctx.stroke();
        const val = yMax - (i/4)*yR;
        ctx.fillStyle = 'rgba(71,85,105,0.8)'; ctx.font = '10px JetBrains Mono,monospace'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(val)+(unit||''), pad.l-5, y+3.5);
    }

    // X labels
    ctx.fillStyle = 'rgba(71,85,105,0.8)'; ctx.textAlign = 'center'; ctx.font = '9px JetBrains Mono,monospace';
    const step = Math.max(1, Math.ceil(labels.length / 8));
    labels.forEach((l,i) => { if (i%step===0||i===labels.length-1) ctx.fillText(l, xOf(i), H-pad.b+14); });

    // Area fill
    const pts = values.map((v,i) => ({v,i})).filter(p => p.v > 0);
    if (pts.length >= 2) {
        ctx.beginPath();
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t+cH);
        grad.addColorStop(0, color.replace('rgb(','rgba(').replace(')',',0.2)'));
        grad.addColorStop(1, color.replace('rgb(','rgba(').replace(')',',0.0)'));
        ctx.fillStyle = grad;
        pts.forEach(({v,i},idx) => { idx===0 ? ctx.moveTo(xOf(i),yOf(v)) : ctx.lineTo(xOf(i),yOf(v)); });
        ctx.lineTo(xOf(pts[pts.length-1].i), pad.t+cH);
        ctx.lineTo(xOf(pts[0].i), pad.t+cH);
        ctx.closePath(); ctx.fill();
    }

    // Line
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    let first = true;
    values.forEach((v,i) => {
        if (v <= 0) { first=true; return; }
        first ? (ctx.moveTo(xOf(i),yOf(v)), first=false) : ctx.lineTo(xOf(i),yOf(v));
    });
    ctx.stroke();

    // Dots (only if ≤60 points)
    if (labels.length <= 60) {
        values.forEach((v,i) => {
            if (v <= 0) return;
            ctx.beginPath(); ctx.fillStyle = color; ctx.arc(xOf(i),yOf(v),3,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.fillStyle = '#070910'; ctx.arc(xOf(i),yOf(v),1.5,0,Math.PI*2); ctx.fill();
        });
    }
}

/* ── ACTIVITY LOG ─────────────────────────────────────────── */
let _logPage = 30;

function buildDailyLog() {
    _logPage = 30;
    _renderLog();
}

function _renderLog() {
    const el = document.getElementById('dailyLogDisplay');
    if (!el) return;
    const DOW      = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const todayStr = getTodayStr();

    const allKeys = Object.keys(localDBInstance).sort((a,b) => b.localeCompare(a));
    if (!allKeys.includes(todayStr)) allKeys.unshift(todayStr);

    const visible   = allKeys.slice(0, _logPage);
    const remaining = allKeys.length - visible.length;

    el.innerHTML = '';
    if (!visible.length) { el.innerHTML = '<div class="log-no-data">No logged days yet.</div>'; return; }

    visible.forEach(ds => {
        const data   = localDBInstance[ds] || {};
        const d      = new Date(ds + 'T00:00:00');
        const dayIdx = Math.round((_today - d) / 86400000);
        const dowLabel = dayIdx === 0 ? 'Today' : dayIdx === 1 ? 'Yesterday'
            : `${DOW[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`;

        const eaten  = parseFloat(data.calsEaten) || 0;
        const budget = parseFloat(data.budget)    || 0;
        let netClass = 'net-none', netText = '—';
        if (data.calsEaten && budget) {
            const net = Math.round(eaten - budget);
            netClass = net <= 0 ? 'net-under' : 'net-over';
            netText  = (net > 0 ? '+' : '') + net.toLocaleString() + ' kcal';
        }

        const entry = document.createElement('div');
        entry.className = 'diary-entry';
        entry.innerHTML = `
            <div class="diary-header">
                <span class="diary-date-label">${dowLabel}</span>
                <span class="diary-net ${netClass}" data-net-badge="${ds}">${netText}</span>
            </div>`;
        el.appendChild(entry);
    });

    if (remaining > 0) {
        const btn = document.createElement('button');
        btn.className = 'load-more-btn';
        btn.textContent = `Load ${Math.min(30,remaining)} more (${remaining} remaining)`;
        btn.onclick = () => { _logPage += 30; _renderLog(); };
        el.appendChild(btn);
    }
}
