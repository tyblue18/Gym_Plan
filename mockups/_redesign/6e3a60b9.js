/* QUE redesign — battles, friends, post card. Exports to window.QueFeed. */
const { DOG, BIKE, BEACH } = window.QueCore;

/* ── BATTLE CARD: type tabs + leaderboard ── */
const BATTLE_TYPES = [
  { id: 'steps', label: 'Steps', unit: 'steps', icon: 'steps' },
  { id: 'calories', label: 'Calories', unit: 'kcal', icon: 'flame' },
  { id: 'diet', label: 'Diet streak', unit: 'days', icon: 'bolt' },
];
const RANGES = ['1 day', '3 days', '1 week'];

const LB_DATA = {
  steps: [
    { name: 'shan lalani', av: 'S', val: 18420, you: false },
    { name: 'Tanishq somani', av: DOG, val: 16110, you: true },
    { name: 'maya r', av: BEACH, val: 12740, you: false },
  ],
  calories: [
    { name: 'Tanishq somani', av: DOG, val: 2310, you: true },
    { name: 'maya r', av: BEACH, val: 2180, you: false },
    { name: 'shan lalani', av: 'S', val: 1990, you: false },
  ],
  diet: [
    { name: 'maya r', av: BEACH, val: 6, you: false },
    { name: 'Tanishq somani', av: DOG, val: 5, you: true },
    { name: 'shan lalani', av: 'S', val: 3, you: false },
  ],
};

function fmt(n) { return n.toLocaleString('en-US'); }

function BattleCard() {
  const [type, setType] = React.useState('steps');
  const [range, setRange] = React.useState('3 days');
  const t = BATTLE_TYPES.find((x) => x.id === type);
  const rows = LB_DATA[type];
  const max = Math.max(...rows.map((r) => r.val));
  const titleMap = { steps: 'Most steps', calories: 'Most calories', diet: 'Diet adherence' };

  return (
    <section className="card">
      <SecLabel amber rule>BATTLES</SecLabel>

      <div className="battle-tabs">
        {BATTLE_TYPES.map((x) => (
          <button key={x.id} className={'btab' + (type === x.id ? ' on' : '')} onClick={() => setType(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="battle-tabs" style={{ marginTop: -6 }}>
        {RANGES.map((r) => (
          <button key={r} className={'btab' + (range === r ? ' on' : '')} onClick={() => setRange(r)}
            style={range === r ? null : { color: 'var(--ink-3)' }}>{r}</button>
        ))}
      </div>

      <div className="battle-head">
        <div>
          <div className="battle-title">{titleMap[type]}</div>
          <div className="battle-sub">NN5 · whole group · {range}</div>
        </div>
        <div className="battle-timer">1d 4h left<small>ends fri</small></div>
      </div>

      {rows.map((r, i) => (
        <div key={r.name} className={'lb-row' + (i === 0 ? ' lead' : '')} style={i > 0 ? { borderTop: '1px solid var(--line)' } : null}>
          <span className="lb-rank">{i + 1}</span>
          {r.av.length <= 2 ? <span className="lb-av txt">{r.av}</span> : <img className="lb-av" src={r.av} alt="" />}
          <div className="lb-body">
            <div className="lb-name" style={r.you ? { color: 'var(--accent-text)' } : null}>{r.name}{r.you && ' · you'}</div>
            <div className="lb-bar"><i style={{ width: (r.val / max * 100) + '%' }}></i></div>
          </div>
          <div className="lb-val">{fmt(r.val)}<small>{t.unit}</small></div>
        </div>
      ))}

      <button className="ghost-btn amber" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
        {Ic.swords({ s: 14 })} New battle
      </button>
    </section>
  );
}

/* compact battles strip for social tab */
function BattleStrip() {
  return (
    <section className="card">
      <SecLabel amber rule right={<button className="ghost-btn amber">{Ic.swords({ s: 13 })} New</button>}>BATTLES</SecLabel>
      <div className="battle-strip">
        <div className="bchip">
          <div className="bc-type">{Ic.steps({ s: 12 })} Steps · 3 days</div>
          <div className="bc-title">NN5 step race</div>
          <div className="bc-foot">
            <div className="bc-pos">2<small>nd / 3</small></div>
            <span className="gribbon battle live" style={{ padding: '3px 8px', fontSize: 10 }}>1d left</span>
          </div>
        </div>
        <div className="bchip">
          <div className="bc-type">{Ic.bolt({ s: 12 })} Diet · 1 week</div>
          <div className="bc-title">Clean week vs shan</div>
          <div className="bc-foot">
            <div className="bc-pos">1<small>st / 2</small></div>
            <span className="gribbon battle live" style={{ padding: '3px 8px', fontSize: 10 }}>4d left</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── FRIENDS ── */
const FRIENDS = [
  { name: 'shan lalani', handle: '@shanthenaan', badges: 1, av: 'S' },
  { name: 'maya r', handle: '@mayalifts', badges: 4, av: BEACH },
  { name: 'dev p', handle: '@devsquats', badges: 2, av: BIKE },
];
function FriendsCard() {
  return (
    <section className="card">
      <SecLabel rule>FRIENDS</SecLabel>
      <div className="add-row">
        <input className="input" placeholder="@username" />
        <button className="btn-add">{Ic.addUser()} Add</button>
      </div>
      {FRIENDS.map((f) => (
        <div className="friend-row" key={f.handle}>
          {f.av.length <= 2 ? <span className="fav txt">{f.av}</span> : <img className="fav" src={f.av} alt="" />}
          <div style={{ minWidth: 0 }}>
            <div className="fname">{f.name}</div>
            <div className="fsub">{f.handle} · {f.badges} badge{f.badges > 1 ? 's' : ''}</div>
          </div>
          <div className="actions">
            <button className="ghost-btn amber">{Ic.swords({ s: 13 })} Battle</button>
            <button className="icon-x">{Ic.x()}</button>
          </div>
        </div>
      ))}
    </section>
  );
}

/* ── POST CARD (set bars) ── */
const EXERCISES = [
  { name: 'Stiff-Leg Deadlift', top: 215, sets: [135, 185, 215, 215] },
  { name: 'Glute focused Squat', top: 155, sets: [115, 135, 155] },
  { name: 'Single leg curl', top: 110, sets: [90, 110] },
  { name: 'Abductor', top: 160, sets: [120, 140, 160] },
  { name: 'Cable Crunch', top: 120, sets: [100, 110, 120] },
];

function SetBars({ sets, top }) {
  return (
    <div className="set-bars" title={sets.length + ' sets'}>
      {sets.map((w, i) => {
        const pct = 42 + (w / top) * 58; // floor so light sets still read
        const warm = w >= top * 0.98;
        return <span key={i} className={'set' + (warm ? ' warm' : '')} style={{ height: pct + '%' }} title={w + ' lbs'}></span>;
      })}
    </div>
  );
}

function PostCard() {
  const [fire, setFire] = React.useState(true);
  const [fireN, setFireN] = React.useState(3);
  const [saved, setSaved] = React.useState(false);
  const toggleFire = () => { setFire((f) => { setFireN((n) => n + (f ? -1 : 1)); return !f; }); };
  return (
    <article className="card post">
      <div className="post-head">
        <img className="post-avatar" src={DOG} alt="" />
        <div>
          <div className="post-name">Tanishq somani</div>
          <div className="post-time">05/26/2026 · 11:37p</div>
        </div>
        <div className="post-vol">
          <div className="num">13,740</div>
          <div className="unit">lbs · volume</div>
        </div>
      </div>

      <div className="tags">
        {['hamstring', 'glutes', 'adductors', 'abs'].map((t) => <span key={t} className="tag">{t}</span>)}
      </div>

      <p className="section-tiny">🏋️ Lifting · 5 exercises · 15 sets</p>

      {EXERCISES.map((e) => (
        <div className="ex" key={e.name}>
          <span className="ex-name">{e.name}</span>
          <span className="ex-val">{e.top} <small>lb</small></span>
          <SetBars sets={e.sets} top={e.top} />
        </div>
      ))}

      <div className="post-foot">
        <button className={'pill fire' + (fire ? ' active' : '')} onClick={toggleFire}>🔥 <span className="cnt">{fireN}</span></button>
        <button className="pill">{Ic.chat({ s: 15 })} 1</button>
        <button className="pill" onClick={() => setSaved((s) => !s)} style={saved ? { color: 'var(--accent-text)', borderColor: 'var(--accent-24)' } : null}>
          {Ic.bookmark()} {saved ? 'Saved' : 'Save'}
        </button>
        <span className="right">{Ic.reply()} comment</span>
      </div>
    </article>
  );
}

window.QueFeed = { BattleCard, BattleStrip, FriendsCard, PostCard, EXERCISES, SetBars };
