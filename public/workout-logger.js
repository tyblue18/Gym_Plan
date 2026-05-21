/* ============================================================
   workout-logger.js — Que fitness tracker
   Add-lift form, muscle group pill selection, per-set table,
   cardio log entries, exercise list rendering, inline editing,
   Save Workout modal, recurring workout banner, template pool,
   drag-and-drop calendar integration, and workout log button.
   Depends on: app-state.js, calendar-scheduler.js
   ============================================================ */

/* ── MUSCLE GROUP SELECTION ───────────────────────────────── */
function selectGroup(g) {
    currentGroup = g;
    document.querySelectorAll('.group-pill').forEach(p => p.classList.toggle('active', p.dataset.g === g));
    const active = document.querySelector(`.group-pill[data-g="${g}"]`);
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    populateExerciseSelect();
}

function populateExerciseSelect() {
    const sel   = document.getElementById('exerciseSelect');
    const usage = getUsage()[currentGroup] || {};
    const usedNames     = Object.keys(usage).sort((a, b) => usage[b] - usage[a]);
    const unusedPresets = PRESETS[currentGroup].filter(e => !usage[e]);
    const all = [...usedNames, ...unusedPresets];
    sel.innerHTML = all.map(e => `<option value="${escH(e)}">${escH(e)}</option>`).join('')
                  + '<option value="__custom__">✏ Custom exercise...</option>';
    document.getElementById('customExInput').style.display = 'none';
    sel.style.display = '';
}

function handleExSelect() {
    const v = document.getElementById('exerciseSelect').value;
    const isCustom = v === '__custom__';
    document.getElementById('customExInput').style.display = isCustom ? '' : 'none';
    document.getElementById('exerciseSelect').style.display = isCustom ? 'none' : '';
    if (isCustom) document.getElementById('customExInput').focus();
}

/* ── PER-SET FORM ─────────────────────────────────────────── */
function adjustSets(delta) {
    pendingSetsCount = Math.max(1, Math.min(20, pendingSetsCount + delta));
    while (pendingSetData.length < pendingSetsCount) pendingSetData.push({r:'1',w:''});
    if (pendingSetData.length > pendingSetsCount) pendingSetData.length = pendingSetsCount;
    renderSetRows();
}

function renderSetRows() {
    const container = document.getElementById('setRowsContainer');
    if (!container) return;
    document.getElementById('setsCountDisplay').textContent = pendingSetsCount;
    container.innerHTML = '';

    pendingSetData.forEach((set, i) => {
        const row = document.createElement('div');
        row.className = 'set-row';

        const num = document.createElement('span');
        num.className = 'set-num-label';
        num.textContent = i + 1;

        const repsIn = document.createElement('input');
        repsIn.type = 'number';
        repsIn.className = 'set-reps-input';
        repsIn.value = set.r || '1';
        repsIn.placeholder = '1';
        repsIn.min = '1';
        repsIn.inputMode = 'numeric';

        const wtIn = document.createElement('input');
        wtIn.type = 'text';
        wtIn.className = 'set-weight-input';
        wtIn.value = set.w || '';
        wtIn.placeholder = 'e.g. 135 lbs';
        wtIn.inputMode = 'decimal';

        repsIn.addEventListener('input', () => { pendingSetData[i].r = repsIn.value; });
        wtIn.addEventListener('input',   () => { pendingSetData[i].w = wtIn.value; });

        repsIn.addEventListener('focus', () => repsIn.select());
        wtIn.addEventListener('focus',   () => wtIn.select());

        // Enter auto-advance: reps → weight → next reps → log on last set
        repsIn.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') { ev.preventDefault(); wtIn.focus(); }
        });
        wtIn.addEventListener('keydown', ev => {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            pendingSetData[i].w = wtIn.value;
            const rows = container.querySelectorAll('.set-row');
            const nextRow = rows[i + 1];
            if (nextRow) {
                nextRow.querySelector('.set-reps-input').focus();
            } else {
                commitAddLift();
            }
        });

        row.append(num, repsIn, wtIn);
        container.appendChild(row);
    });
}

/* ── LIFT COMMIT ──────────────────────────────────────────── */
function commitAddLift() {
    const sel  = document.getElementById('exerciseSelect');
    const name = sel.style.display === 'none'
        ? document.getElementById('customExInput').value.trim()
        : sel.value;
    if (!name || name === '__custom__') return;

    bumpUsage(currentGroup, name);

    // Snapshot current DOM values into pendingSetData
    document.querySelectorAll('.set-reps-input').forEach((inp, i) => {
        if (pendingSetData[i]) pendingSetData[i].r = inp.value.trim() || '1';
    });
    document.querySelectorAll('.set-weight-input').forEach((inp, i) => {
        if (pendingSetData[i]) pendingSetData[i].w = inp.value.trim();
    });

    const arr = parseEx(document.getElementById('inDayExercises').value);
    arr.push({ k:'lift', g: currentGroup, n: name, sets: pendingSetData.map(s => ({...s})) });
    applyExercises(arr);

    // Reset weights, keep count + reps=1
    pendingSetData = Array.from({length: pendingSetsCount}, () => ({r:'1',w:''}));
    renderSetRows();
}

/* ── CARDIO ENTRY ─────────────────────────────────────────── */
function addCardioEntry(type) {
    const arr = parseEx(document.getElementById('inDayExercises').value);
    arr.push({ k: type, v1:'', v2:'', note:'' });
    applyExercises(arr);
}

/* ── EXERCISE ARRAY OPERATIONS ────────────────────────────── */
function deleteEntry(idx) {
    const arr = parseEx(document.getElementById('inDayExercises').value);
    arr.splice(idx, 1);
    applyExercises(arr);
}

function updateCardioField(idx, field, val) {
    const arr = parseEx(document.getElementById('inDayExercises').value);
    if (arr[idx]) arr[idx][field] = val;
    document.getElementById('inDayExercises').value = serializeEx(arr);
    syncCardioToMetabolic(arr);
    syncActiveDayToMemory();
}

function applyExercises(arr) {
    document.getElementById('inDayExercises').value = serializeEx(arr);
    renderWorkoutLog();
    syncCardioToMetabolic(arr);
    syncActiveDayToMemory();
}

/* ── WORKOUT LOG RENDER ───────────────────────────────────── */
function renderWorkoutLog() {
    const arr = parseEx(document.getElementById('inDayExercises').value);
    renderLiftList(arr);
    renderCardioList(arr);
}

function renderLiftList(arr) {
    const lifts  = arr.map((e,i) => ({...e,_i:i})).filter(e => e.k==='lift'||e.k==='text');
    const el     = document.getElementById('liftListDisplay');
    const btnWrap = document.getElementById('saveWorkoutBtnWrap');
    el.innerHTML = '';
    if (!lifts.length) {
        el.innerHTML = '<div class="exercise-empty">No exercises logged — select a muscle group and add above.</div>';
        if (btnWrap) btnWrap.style.display = 'none';
        return;
    }
    if (btnWrap) btnWrap.style.display = '';

    lifts.forEach((e, numIdx) => {
        const item     = document.createElement('div');
        const grpClass = e.k === 'lift' ? `has-${e.g}` : 'has-text';
        item.className = `exercise-item ${grpClass}`;

        if (e.k === 'lift') {
            const entry = normalizeLift(e);
            item.innerHTML = `
                <span class="ex-num">${numIdx+1}</span>
                <span class="group-badge ${entry.g}">${entry.g}</span>
                <div class="ex-main">
                    <span class="ex-text" onclick="startEditName(this,${e._i})">${escH(entry.n)}</span>
                    <span class="sr-badge" onclick="startEditSR(this,${e._i})">${fmtSets(entry.sets)}</span>
                </div>
                <button class="ex-del" onclick="deleteEntry(${e._i})">×</button>`;
        } else {
            item.innerHTML = `
                <span class="ex-num">${numIdx+1}</span>
                <span class="ex-text" onclick="startEditName(this,${e._i})">${escH(e.n)}</span>
                <button class="ex-del" onclick="deleteEntry(${e._i})">×</button>`;
        }
        el.appendChild(item);
    });
}

function renderCardioList(arr) {
    const cardios = arr.map((e,i) => ({...e,_i:i})).filter(e => ['swim','run','bike'].includes(e.k));
    const el = document.getElementById('cardioListDisplay');
    el.innerHTML = '';
    if (!cardios.length) {
        el.innerHTML = '<div class="cardio-empty">No cardio logged — tap Swim, Run, or Bike above.</div>';
        return;
    }
    const cfg = {
        swim: {icon:'🏊',label:'Swimming',  f1:'Duration (min)', f2:'Distance',  f2ph:'1500 yds', notePh:'Drills, laps, style...'},
        run:  {icon:'🏃',label:'Running',   f1:'Distance (mi)',  f2:'Time (min)',f2ph:'45',       notePh:'Pace, route, effort...'},
        bike: {icon:'🚴',label:'Cycling',   f1:'Distance (mi)',  f2:'Time (min)',f2ph:'60',       notePh:'Route, watts, HR zone...'}
    };
    cardios.forEach(e => {
        const c    = cfg[e.k];
        const card = document.createElement('div');
        card.className = `cardio-entry ${e.k}-entry`;
        card.innerHTML = `
            <div class="cardio-header">
                <div class="cardio-icon-label"><span class="cardio-icon">${c.icon}</span><span class="cardio-label">${c.label}</span></div>
                <button class="ex-del" onclick="deleteEntry(${e._i})" style="color:var(--text-tertiary)">×</button>
            </div>
            <div class="cardio-fields">
                <div class="two-col">
                    <div class="input-group"><label>${c.f1}</label><input type="text" value="${escH(e.v1||'')}" placeholder="${e.k==='swim'?'45':'5.2'}" oninput="updateCardioField(${e._i},'v1',this.value)"></div>
                    <div class="input-group"><label>${c.f2}</label><input type="text" value="${escH(e.v2||'')}" placeholder="${c.f2ph}" oninput="updateCardioField(${e._i},'v2',this.value)"></div>
                </div>
                <div class="input-group"><label>Notes</label><input type="text" value="${escH(e.note||'')}" placeholder="${c.notePh}" oninput="updateCardioField(${e._i},'note',this.value)"></div>
            </div>`;
        el.appendChild(card);
    });
}

/* ── INLINE EXERCISE NAME EDITING ─────────────────────────── */
function startEditName(span, idx) {
    if (span.parentElement.querySelector('.ex-input')) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'ex-input'; inp.value = span.textContent;
    span.parentElement.classList.add('editing');
    span.replaceWith(inp);
    inp.focus(); inp.select();
    const commit = () => {
        const v = inp.value.trim();
        if (!v) { renderWorkoutLog(); return; }
        const arr = parseEx(document.getElementById('inDayExercises').value);
        if (arr[idx]) arr[idx].n = v;
        document.getElementById('inDayExercises').value = serializeEx(arr);
        syncActiveDayToMemory();
        renderWorkoutLog();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
        if (ev.key === 'Escape') renderWorkoutLog();
    });
}

/* ── INLINE PER-SET EDITING ───────────────────────────────── */
function startEditSR(badge, idx) {
    const arr   = parseEx(document.getElementById('inDayExercises').value);
    const e     = arr[idx]; if (!e) return;
    const entry = normalizeLift(e);
    const wrap  = document.createElement('div');
    wrap.className = 'sr-edit-wrap';

    entry.sets.forEach((set, si) => {
        const row = document.createElement('div'); row.className = 'sr-edit-row';
        const num = document.createElement('span'); num.className = 'sr-edit-num'; num.textContent = si+1;
        const sep = document.createElement('span'); sep.className = 'sr-edit-sep'; sep.textContent = '@';
        const rI  = document.createElement('input'); rI.type='text'; rI.className='sr-edit-input'; rI.value=set.r||'1'; rI.placeholder='reps'; rI.style.width='44px';
        const wI  = document.createElement('input'); wI.type='text'; wI.className='sr-edit-input'; wI.value=set.w||''; wI.placeholder='wt'; wI.style.width='64px';
        row.append(num, rI, sep, wI);
        wrap.appendChild(row);
    });

    badge.replaceWith(wrap);

    const commit = () => {
        const na = parseEx(document.getElementById('inDayExercises').value);
        const ne = normalizeLift({...na[idx]});
        wrap.querySelectorAll('.sr-edit-row').forEach((row, si) => {
            const inputs = row.querySelectorAll('input');
            if (ne.sets[si]) { ne.sets[si].r = inputs[0].value.trim()||'1'; ne.sets[si].w = inputs[1].value.trim(); }
        });
        na[idx] = ne;
        document.getElementById('inDayExercises').value = serializeEx(na);
        syncActiveDayToMemory();
        renderWorkoutLog();
    };

    wrap.addEventListener('focusout', ev => { if (!wrap.contains(ev.relatedTarget)) commit(); });
    wrap.querySelectorAll('input').forEach(i => i.addEventListener('keydown', ev => { if (ev.key==='Enter') i.blur(); }));
    wrap.querySelector('input').focus();
}

/* ── LOG WORKOUT BUTTON ───────────────────────────────────── */
function logWorkoutForDate() {
    syncActiveDayToMemory(true);
    const btn = document.getElementById('logWorkoutBtn');
    if (btn) {
        btn.textContent = '✓ Logged';
        btn.style.background = 'var(--accent-success)';
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = 'Log Workout';
            btn.style.background = '';
            btn.disabled = false;
        }, 2000);
    }
}

/* ── SAVE WORKOUT MODAL ───────────────────────────────────── */
let _swm = { isPreset: true, isRecurring: false, days: [], freq: 1 };

function openSaveWorkoutModal() {
    const lifts = parseEx(document.getElementById('inDayExercises').value).filter(e => e.k === 'lift');
    if (!lifts.length) return;
    const groups   = [...new Set(lifts.map(e => e.g || 'other'))];
    const autoName = groups.map(g => g.charAt(0).toUpperCase()+g.slice(1)).join(' + ') + ' Workout';
    document.getElementById('swmName').value = autoName;
    _swm = { isPreset: true, isRecurring: false, days: [], freq: 1 };
    _swmRefreshUI();
    document.getElementById('saveWorkoutModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const el = document.getElementById('swmName'); if (el) el.select(); }, 80);
}

function closeSaveWorkoutModal() {
    document.getElementById('saveWorkoutModal').classList.remove('open');
    document.body.style.overflow = '';
}

function handleSWMBgClick(e) {
    if (e.target === document.getElementById('saveWorkoutModal')) closeSaveWorkoutModal();
}

function swmToggle(which) {
    if (which === 'preset') {
        _swm.isPreset = !_swm.isPreset;
    } else {
        _swm.isRecurring = !_swm.isRecurring;
        document.getElementById('swmRecurringSection').style.display = _swm.isRecurring ? '' : 'none';
    }
    _swmRefreshUI();
}

function swmToggleDay(d) {
    const i = _swm.days.indexOf(d);
    if (i === -1) _swm.days.push(d); else _swm.days.splice(i, 1);
    document.querySelectorAll('.day-pick-btn').forEach(btn =>
        btn.classList.toggle('selected', _swm.days.includes(parseInt(btn.dataset.day)))
    );
}

function swmSetFreq(n) {
    _swm.freq = n;
    document.getElementById('swmFreqWeekly').classList.toggle('active',   n===1);
    document.getElementById('swmFreqBiweekly').classList.toggle('active', n===2);
}

function _swmRefreshUI() {
    document.getElementById('swmTogglePreset').classList.toggle('on',    _swm.isPreset);
    document.getElementById('swmToggleRecurring').classList.toggle('on', _swm.isRecurring);
}

function confirmSaveWorkout() {
    const name = document.getElementById('swmName').value.trim();
    if (!name) { document.getElementById('swmName').focus(); return; }

    const lifts = parseEx(document.getElementById('inDayExercises').value).filter(e => e.k === 'lift');
    if (!lifts.length) { closeSaveWorkoutModal(); return; }

    const preset = {
        id:          Date.now().toString(36) + Math.random().toString(36).slice(2,6),
        name,
        exercises:   JSON.stringify(lifts),
        isRecurring: _swm.isRecurring,
        daysOfWeek:  _swm.isRecurring ? [..._swm.days] : [],
        everyNWeeks: _swm.freq,
        createdAt:   activeDayFocusString
    };

    if (_swm.isPreset) {
        const pool      = JSON.parse(localStorage.getItem('ironmanTemplatesPool')) || defaultTemplates;
        const textLines = lifts.map(e => {
            const entry = normalizeLift(e);
            const n = entry.sets ? entry.sets.length : 1;
            return `${entry.n}: ${n}x`;
        });
        pool.push({ id: preset.id, title: name, text: textLines.join('\n') });
        localStorage.setItem('ironmanTemplatesPool', JSON.stringify(pool));
        buildWorkoutPool();
    }

    const allPresets = JSON.parse(localStorage.getItem('queWorkoutPresets') || '[]');
    allPresets.push(preset);
    localStorage.setItem('queWorkoutPresets', JSON.stringify(allPresets));

    closeSaveWorkoutModal();

    const btn = document.getElementById('saveWorkoutBtn');
    if (btn) {
        btn.textContent = '✓ Saved';
        btn.style.color = 'var(--accent-success)';
        btn.style.borderColor = 'var(--accent-success)';
        setTimeout(() => {
            btn.textContent = 'Save Workout';
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2200);
    }
}

/* ── RECURRING WORKOUT BANNER ─────────────────────────────── */
function checkAndShowRecurringBanner(dateStr) {
    const bannerEl = document.getElementById('recurringBanner');
    if (!bannerEl) return;
    const all      = JSON.parse(localStorage.getItem('queWorkoutPresets') || '[]');
    const dow      = new Date(dateStr+'T00:00:00').getDay();
    const matches  = all.filter(p => p.isRecurring && p.daysOfWeek.includes(dow));
    const hasLifts = parseEx(localDBInstance[dateStr]?.exercises || '').some(e => e.k === 'lift');
    if (matches.length && !hasLifts) {
        const m = matches[0];
        bannerEl.innerHTML = `<div class="recurring-banner">
            <span class="recurring-banner-text">Recurring: <strong>${escH(m.name)}</strong></span>
            <button class="recurring-load-btn" onclick="loadRecurringWorkout('${escH(m.id)}')">Load</button>
        </div>`;
        bannerEl.style.display = '';
    } else {
        bannerEl.style.display = 'none';
    }
}

function loadRecurringWorkout(id) {
    const all    = JSON.parse(localStorage.getItem('queWorkoutPresets') || '[]');
    const preset = all.find(p => p.id === id);
    if (!preset) return;
    const arr = parseEx(document.getElementById('inDayExercises').value);
    parseEx(preset.exercises).forEach(e => arr.push(e));
    applyExercises(arr);
    const bannerEl = document.getElementById('recurringBanner');
    if (bannerEl) bannerEl.style.display = 'none';
}

/* ── TEMPLATE MODAL ───────────────────────────────────────── */
function openTemplateModal() {
    const pool = JSON.parse(localStorage.getItem('ironmanTemplatesPool')) || defaultTemplates;
    const list = document.getElementById('templateModalList');
    list.innerHTML = '';
    pool.forEach(tmpl => {
        const opt = document.createElement('div');
        opt.className = 'tmpl-option';
        opt.innerHTML = `<div class="tmpl-option-title">${escH(tmpl.title)}</div><div class="tmpl-option-preview">${escH(tmpl.text)}</div>`;
        opt.addEventListener('click', () => loadTemplate(tmpl.text));
        list.appendChild(opt);
    });
    document.getElementById('templateModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeTemplateModal() {
    document.getElementById('templateModal').classList.remove('open');
    document.body.style.overflow = '';
}

function handleModalBgClick(e) {
    if (e.target === document.getElementById('templateModal')) closeTemplateModal();
}

function loadTemplate(text) {
    closeTemplateModal();
    const arr = parseEx(document.getElementById('inDayExercises').value);
    text.split('\n').filter(l=>l.trim()).forEach(l => arr.push({k:'text',n:l}));
    applyExercises(arr);
}

/* ── TEMPLATE POOL (DRAG & DROP) ──────────────────────────── */
function buildWorkoutPool() {
    const block = document.getElementById('workoutPoolBlock');
    if (!block) return;
    block.innerHTML = '';
    const pool = JSON.parse(localStorage.getItem('ironmanTemplatesPool')) || defaultTemplates;
    pool.forEach(tmpl => {
        const w = document.createElement('div');
        w.className = 'pool-item';
        w.setAttribute('draggable', 'true');
        w.setAttribute('ondragstart', `handleTemplateDrag(event,'${tmpl.id}')`);
        w.addEventListener('touchstart', () => {
            activeDayFocusString && confirm(`Load "${tmpl.title}" onto ${activeDayFocusString}?`) && loadTemplate(tmpl.text);
        }, {passive: true});
        w.innerHTML = `<strong>${escH(tmpl.title)}</strong><textarea id="tmpl_text_${tmpl.id}" rows="4" oninput="saveTemplatesPool()">${tmpl.text}</textarea>`;
        block.appendChild(w);
    });
}

function saveTemplatesPool() {
    const p = defaultTemplates.map(t => ({
        id: t.id, title: t.title,
        text: document.getElementById(`tmpl_text_${t.id}`)?.value ?? t.text
    }));
    localStorage.setItem('ironmanTemplatesPool', JSON.stringify(p));
}

function handleTemplateDrag(e, id) {
    const el = document.getElementById(`tmpl_text_${id}`);
    if (el) e.dataTransfer.setData("text/plain", el.value);
}

function handleCardioPoolDrag(e, type) {
    e.dataTransfer.setData("text/plain", JSON.stringify({__cardio: type}));
}

function allowCellDrop(e) { e.preventDefault(); }

function handleCellDrop(e, dateStr) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    if (!localDBInstance[dateStr]) {
        localDBInstance[dateStr] = {steps:0,runDist:0,runTime:0,bikeDist:0,bikeTime:0,exercises:'',notes:''};
    }
    let dropped = null;
    try { dropped = JSON.parse(raw); } catch { dropped = null; }

    if (dropped && dropped.__cardio) {
        const arr = parseEx(localDBInstance[dateStr].exercises);
        arr.push({k: dropped.__cardio, v1:'', v2:'', note:''});
        localDBInstance[dateStr].exercises = serializeEx(arr);
    } else {
        const arr = parseEx(localDBInstance[dateStr].exercises);
        raw.split('\n').filter(l=>l.trim()).forEach(l => arr.push({k:'text',n:l}));
        localDBInstance[dateStr].exercises = serializeEx(arr);
    }

    localStorage.setItem('ironmanCoreDB_v2', JSON.stringify(localDBInstance));
    renderActiveViewLayout();
    if (dateStr === activeDayFocusString) loadTargetDayFromMemory(dateStr);
}
