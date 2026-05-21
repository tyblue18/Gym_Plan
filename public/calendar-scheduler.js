/* ============================================================
   calendar-scheduler.js — Que fitness tracker
   Calendar navigation, month/week/day grid rendering, mobile
   week strip, day-cell creation, activity dots, day selection,
   workout summary panel, and muscle-group pill scroll handler.
   Depends on: app-state.js
   ============================================================ */

/* ── CALENDAR NAV SELECTORS ───────────────────────────────── */
function initNavSelectors() {
    const mSel = document.getElementById('selectMonth');
    const ySel = document.getElementById('selectYear');
    mSel.innerHTML = ''; ySel.innerHTML = '';
    months.forEach((m,i) => { mSel.options[mSel.options.length] = new Option(m,i); });
    for (let y=2025; y<=2030; y++) { ySel.options[ySel.options.length] = new Option(y,y); }
}

function syncSelectorsToDateObject() {
    currentDisplayDate.setFullYear(parseInt(document.getElementById('selectYear').value));
    currentDisplayDate.setMonth(parseInt(document.getElementById('selectMonth').value));
    renderActiveViewLayout();
}

function switchViewScope(mode) {
    activeViewMode = mode;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    document.getElementById({day:'btnViewDay',week:'btnViewWeek',month:'btnViewMonth'}[mode]).classList.add('active');
    renderActiveViewLayout();
}

/* ── MOBILE CALENDAR TITLE ────────────────────────────────── */
function updateCalMobileTitle() {
    const el = document.getElementById('calMobileTitle');
    if (!el) return;
    if (activeViewMode === 'week') {
        const sow = new Date(currentDisplayDate);
        sow.setDate(currentDisplayDate.getDate() - currentDisplayDate.getDay());
        const eow = new Date(sow); eow.setDate(sow.getDate() + 6);
        const startLabel = `${months[sow.getMonth()].substring(0,3)} ${sow.getDate()}`;
        const endLabel   = sow.getMonth() !== eow.getMonth()
            ? `${months[eow.getMonth()].substring(0,3)} ${eow.getDate()}`
            : `${eow.getDate()}`;
        el.textContent = `${startLabel} – ${endLabel}`;
    } else {
        el.textContent = `${months[currentDisplayDate.getMonth()]} ${currentDisplayDate.getFullYear()}`;
    }
}

/* ── TIMELINE NAVIGATION ──────────────────────────────────── */
function executeTimelineNavigation(dir) {
    if (activeViewMode === "month")      currentDisplayDate.setMonth(currentDisplayDate.getMonth()+dir);
    else if (activeViewMode === "week")  currentDisplayDate.setDate(currentDisplayDate.getDate()+dir*7);
    else                                 currentDisplayDate.setDate(currentDisplayDate.getDate()+dir);
    document.getElementById('selectMonth').value = currentDisplayDate.getMonth();
    document.getElementById('selectYear').value  = currentDisplayDate.getFullYear();
    updateCalMobileTitle();
    renderActiveViewLayout();
}

/* ── CALENDAR GRID RENDERER ───────────────────────────────── */
function renderActiveViewLayout() {
    updateCalMobileTitle();
    const box    = document.getElementById('calendarGridBox');
    const labels = document.getElementById('calendarWeekLabelsContainer');
    box.innerHTML = '';
    box.className  = "calendar-grid view-mode-" + activeViewMode;

    const year = currentDisplayDate.getFullYear();
    const month = currentDisplayDate.getMonth();
    const dateVal = currentDisplayDate.getDate();
    const isMobile = window.innerWidth <= 768;

    document.querySelectorAll('.weekday-label').forEach(el => {
        el.innerText = isMobile
            ? el.getAttribute('data-full')[0]
            : el.getAttribute('data-full').substring(0,3);
    });

    if (activeViewMode === "month") {
        labels.style.display = "grid";
        const firstDay  = new Date(year,month,1).getDay();
        const totalDays = new Date(year,month+1,0).getDate();
        for (let i=0; i<firstDay; i++) {
            const e = document.createElement('div');
            e.className = 'calendar-day-cell empty-day';
            box.appendChild(e);
        }
        for (let d=1; d<=totalDays; d++) {
            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            appendDayCell(box, ds, d);
        }
    } else {
        labels.style.display = "none";
        if (activeViewMode === "week") {
            const sow = new Date(currentDisplayDate);
            sow.setDate(currentDisplayDate.getDate() - currentDisplayDate.getDay());
            for (let i=0; i<7; i++) {
                const ld = new Date(sow); ld.setDate(sow.getDate()+i);
                const ds = `${ld.getFullYear()}-${String(ld.getMonth()+1).padStart(2,'0')}-${String(ld.getDate()).padStart(2,'0')}`;
                appendDayCell(box, ds, `${months[ld.getMonth()]} ${ld.getDate()}`);
            }
        } else {
            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(dateVal).padStart(2,'0')}`;
            appendDayCell(box, ds, `${months[month]} ${dateVal}, ${year}`);
            if (activeDayFocusString !== ds) focusCalendarDay(ds);
        }
    }
}

/* ── DAY CELL FACTORY ─────────────────────────────────────── */
function appendDayCell(container, dateStr, label) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    cell.id        = `cell_${dateStr}`;
    cell.setAttribute('onclick',   `focusCalendarDay('${dateStr}')`);
    cell.setAttribute('ondragover','allowCellDrop(event)');
    cell.setAttribute('ondrop',    `handleCellDrop(event,'${dateStr}')`);

    const data       = localDBInstance[dateStr] || {};
    const summary    = buildCellSummary(data.exercises || '');
    const hasContent = !!summary;
    const isMobile   = window.innerWidth <= 768;

    // X button — appears on hover, removes the day's workout
    const delBtn = hasContent
        ? `<button class="cell-del-btn" onclick="clearCalendarDayWorkout(event,'${dateStr}')" title="Remove workout">×</button>`
        : '';

    if (isMobile && activeViewMode === 'week') {
        const d       = new Date(dateStr + 'T00:00:00');
        const dayAbbr = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
        cell.innerHTML = `<div class="cell-day-abbr">${dayAbbr}</div><div class="day-num-track">${d.getDate()}</div>${hasContent ? '<div class="cell-activity-dot"></div>' : ''}`;
    } else {
        cell.innerHTML = `${delBtn}<div class="day-num-track">${label}</div>${summary ? `<div class="cell-contents-summary">${escH(summary)}</div>` : ''}`;
    }

    if (dateStr === activeDayFocusString) cell.classList.add('selected-day');
    const todayStr = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
    if (dateStr === todayStr) cell.classList.add('today-cell');
    container.appendChild(cell);
}

/* ── DAY SELECTION ────────────────────────────────────────── */
function focusCalendarDay(dateStr) {
    activeDayFocusString = dateStr;
    document.querySelectorAll('.calendar-day-cell').forEach(c => c.classList.remove('selected-day'));
    const cell = document.getElementById(`cell_${dateStr}`);
    if (cell) cell.classList.add('selected-day');
    const p = dateStr.split('-');
    currentDisplayDate = new Date(+p[0], +p[1]-1, +p[2]);
    document.getElementById('activeDayLabel').innerText = fmtDate(dateStr);
    loadTargetDayFromMemory(dateStr);
    buildDayWorkoutSummary(dateStr);
    checkAndShowRecurringBanner(dateStr);
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            const card = document.getElementById('workoutLogCard');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
    }
}

/* ── CLEAR CALENDAR DAY ───────────────────────────────────── */
function clearCalendarDayWorkout(event, dateStr) {
    event.stopPropagation();
    if (!confirm(`Remove all workouts for ${fmtDate(dateStr)}?`)) return;
    if (!localDBInstance[dateStr]) return;
    Object.assign(localDBInstance[dateStr], {
        exercises:'', notes:'', steps:0,
        runDist:0, runTime:0, bikeDist:0, bikeTime:0, swimTime:0, burn:0
    });
    localStorage.setItem('ironmanCoreDB_v2', JSON.stringify(localDBInstance));
    if (dateStr === activeDayFocusString) {
        document.getElementById('inDayExercises').value = '';
        document.getElementById('inDayNotes').value = '';
        ['inSteps','inRunDist','inRunTime','inBikeDist','inBikeTime','inSwimTime']
            .forEach(id => { document.getElementById(id).value = 0; });
        renderWorkoutLog();
    }
    renderActiveViewLayout();
    buildDayWorkoutSummary(dateStr);
}

/* ── TODAY'S WORKOUTS SUMMARY PANEL ──────────────────────── */
function buildDayWorkoutSummary(dateStr) {
    const content = document.getElementById('dayWorkoutContent');
    const title   = document.getElementById('dayWorkoutTitle');
    if (!content) return;

    const todayStr = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
    if (title) title.textContent = dateStr === todayStr ? "Today's Workouts" : `${fmtDate(dateStr)}'s Workouts`;

    const data = localDBInstance[dateStr] || {};
    const arr  = parseEx(data.exercises || '');
    if (!arr.length) {
        content.innerHTML = '<div class="exercise-empty">No workouts logged for this day.</div>';
        return;
    }

    const lifts  = arr.filter(e => e.k === 'lift');
    const cardio = arr.filter(e => ['swim','run','bike'].includes(e.k));
    let html = '';

    if (lifts.length) {
        const groups = {};
        lifts.forEach(e => {
            const entry = normalizeLift(e);
            const g = entry.g || 'other';
            if (!groups[g]) groups[g] = [];
            groups[g].push(entry);
        });
        Object.keys(groups).forEach(g => {
            html += `<div class="day-workout-group"><div class="day-workout-group-label">${g.charAt(0).toUpperCase()+g.slice(1)}</div>`;
            groups[g].forEach(e => {
                const chips = (e.sets||[]).map((s,i) =>
                    `<span class="day-set-chip"><span class="day-set-chip-label">S${i+1}</span>${s.r||'—'}${s.w?' @ '+escH(s.w):''}</span>`
                ).join('');
                html += `<div class="day-workout-item">
                    <span class="day-workout-name">${escH(e.n)}</span>
                    ${chips ? `<div class="day-workout-sets">${chips}</div>` : ''}
                </div>`;
            });
            html += '</div>';
        });
    }

    if (cardio.length) {
        const cfg = { swim:{label:'Swimming'}, run:{label:'Running'}, bike:{label:'Cycling'} };
        html += '<div class="day-workout-group"><div class="day-workout-group-label">Cardio</div>';
        cardio.forEach(e => {
            const c    = cfg[e.k];
            const dist = e.v1 ? `${e.v1}${e.k==='swim'?' min':' mi'}` : '';
            const time = e.v2 && e.k!=='swim' ? ` · ${e.v2} min` : '';
            const note = e.note ? ` — ${escH(e.note)}` : '';
            html += `<div class="day-workout-item">
                <span class="day-workout-name">${c.label}${dist?' — '+dist:''}${time}${note}</span>
            </div>`;
        });
        html += '</div>';
    }

    content.innerHTML = html;
}

/* ── MUSCLE GROUP PILL SCROLL ─────────────────────────────── */
function initGroupPillsScroll() {
    const row = document.getElementById('groupPillsRow');
    if (!row) return;

    let startX = 0, scrollOrigin = 0, moved = false;

    row.addEventListener('mousedown', e => {
        startX = e.pageX;
        scrollOrigin = row.scrollLeft;
        moved = false;
        row.style.cursor = 'grabbing';
        row.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e => {
        if (!row.style.cursor || row.style.cursor !== 'grabbing') return;
        const dx = e.pageX - startX;
        if (Math.abs(dx) > 3) moved = true;
        if (moved) row.scrollLeft = scrollOrigin - dx;
    });
    document.addEventListener('mouseup', () => {
        row.style.cursor = 'grab';
        row.style.userSelect = '';
    });

    // Suppress the click that fires after a drag
    row.addEventListener('click', e => {
        if (moved) { e.stopImmediatePropagation(); moved = false; }
    }, true);

    // Mouse wheel: vertical delta → horizontal scroll
    row.addEventListener('wheel', e => {
        e.preventDefault();
        row.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
    }, { passive: false });
}
