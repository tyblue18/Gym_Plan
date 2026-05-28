/* QUE — redesigned workout share card (Hevy/Strava-inspired, mobile-first). */
const { DOG, BEACH, BIKE } = window.QueCore;

/* workout data — sets are [weight, reps]; `pr` flags a personal record */
const WORKOUTS = [
  {
    user: { name: 'Tanishq somani', handle: '@tanishq', av: DOG }, date: 'TUE 5/26',
    title: 'LEG DAY', type: 'Lifting', time: '11:37p',
    volume: 13740, sets: 15, dur: '52m', prs: 1,
    tags: ['hamstring', 'glutes', 'adductors', 'abs'],
    exercises: [
      { name: 'Stiff-Leg Deadlift', pr: true, sets: [[135, 10], [185, 8], [215, 6], [215, 6]] },
      { name: 'Glute focused Squat', sets: [[115, 12], [135, 10], [155, 8]] },
      { name: 'Single leg curl', sets: [[90, 12], [110, 10]] },
      { name: 'Abductor', sets: [[120, 15], [140, 12], [160, 10]] },
      { name: 'Cable Crunch', sets: [[100, 15], [110, 12], [120, 12]] },
    ],
  },
  {
    user: { name: 'maya r', handle: '@mayalifts', av: BEACH }, date: 'MON 5/25',
    title: 'PUSH', type: 'Lifting', time: '7:02a',
    volume: 9850, sets: 11, dur: '44m', prs: 0,
    tags: ['chest', 'shoulders', 'triceps'],
    exercises: [
      { name: 'Incline Bench Press', sets: [[95, 10], [115, 8], [125, 6]] },
      { name: 'Shoulder Press', sets: [[65, 12], [75, 10], [80, 8]] },
      { name: 'Cable Fly', sets: [[40, 15], [45, 12]] },
      { name: 'Tricep Pushdown', sets: [[50, 15], [60, 12], [70, 10]] },
    ],
  },
];

function fmtK(n) { return n.toLocaleString('en-US'); }

function ExerciseRow({ ex }) {
  const best = Math.max(...ex.sets.map((s) => s[0]));
  return (
    <div className="wc-ex">
      <div className="wc-ex-top">
        <span className="wc-ex-count">{ex.sets.length}×</span>
        <span className="wc-ex-name">{ex.name}</span>
        {ex.pr && <span className="pr-tag">{Ic.bolt({ s: 9 })} PR</span>}
        <span className="wc-ex-best">{best} <small>lb</small></span>
      </div>
      <div className="wc-sets">
        {ex.sets.map((s, i) => (
          <span key={i} className={'wc-set' + (s[0] === best ? ' top' : '')}>
            <b>{s[0]}</b><span className="reps">×{s[1]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function WorkoutCard({ w }) {
  const [fire, setFire] = React.useState(false);
  const [fireN, setFireN] = React.useState(2);
  const [saved, setSaved] = React.useState(false);
  const toggleFire = () => { setFire((f) => { setFireN((n) => n + (f ? -1 : 1)); return !f; }); };
  return (
    <article className="wcard">
      <div className="wc-head">
        {w.user.av && w.user.av.length > 2
          ? <img className="wc-av" src={w.user.av} alt="" />
          : <span className="wc-av txt">{(w.user.name[0] || '?').toUpperCase()}</span>}
        <div style={{ minWidth: 0 }}>
          <div className="wc-name">{w.user.name}</div>
          <div className="wc-sub">{w.user.handle} · {w.time}</div>
        </div>
        <button className="icon-btn wc-menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
        </button>
      </div>

      <div className="wc-title-row">
        <span className="wc-title">{w.title}</span>
        <span className="wc-type">{Ic.bolt({ s: 11 })} {w.type}</span>
      </div>

      <div className="wc-stats">
        <div className="wc-stat vol"><div className="v">{fmtK(w.volume)}</div><div className="k">Volume lb</div></div>
        <div className="wc-stat"><div className="v">{w.sets}</div><div className="k">Sets</div></div>
        <div className="wc-stat"><div className="v">{w.dur}</div><div className="k">Time</div></div>
        <div className="wc-stat"><div className="v"><span className={w.prs ? 'pr' : ''}>{w.prs}</span></div><div className="k">PRs</div></div>
      </div>

      <div className="wc-body">
        <div className="wc-tags">{w.tags.map((t) => <span key={t} className="wc-tag">{t}</span>)}</div>
        <div className="wc-exhead">Exercises · {w.exercises.length}</div>
        {w.exercises.map((ex) => <ExerciseRow key={ex.name} ex={ex} />)}
      </div>

      <div className="wc-foot">
        <button className={'pill fire' + (fire ? ' active' : '')} onClick={toggleFire}>🔥 <span className="cnt">{fireN}</span></button>
        <button className="pill">{Ic.chat({ s: 15 })} <span className="cnt">1</span></button>
        <button className={'pill' + (saved ? ' saved' : '')} onClick={() => setSaved((s) => !s)}>{Ic.bookmark()} {saved ? 'Saved' : 'Save'}</button>
        <span className="spacer"></span>
        <button className="icon-btn">{Ic.reply({ s: 16 })}</button>
      </div>
    </article>
  );
}

window.QueWorkout = { WorkoutCard, WORKOUTS };
