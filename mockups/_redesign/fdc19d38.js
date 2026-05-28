/* QUE redesign — shared components. Exports building blocks to window. */
const DOG = 'https://placedog.net/200/200?id=12';
const BIKE = 'https://picsum.photos/seed/quebike/120/120';
const BEACH = 'https://picsum.photos/seed/quebeach/120/120';
const RUN = 'https://picsum.photos/seed/querun/120/120';

/* ── chrome ── */
function StatusBar() {
  return (
    <div className="statusbar mono">
      <span>1:35</span>
      <span className="sb-right">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 6 8l6 6 6-6zM6 16l6 6 6-6-6-6z" opacity=".0"/><path d="M12 1 5 8l7 7 7-7zm0 3 4 4-4 4-4-4z"/></svg>
        <svg width="15" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C7 4 2.7 6 0 9l12 13L24 9c-2.7-3-7-5-12-5z" opacity=".9"/></svg>
        <svg width="16" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="14" width="3" height="6" rx="1"/><rect x="7" y="10" width="3" height="10" rx="1"/><rect x="12" y="6" width="3" height="14" rx="1"/><rect x="17" y="3" width="3" height="17" rx="1"/></svg>
        <span className="sb-batt">91</span>
      </span>
    </div>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <div className="brand"><span className="logo"></span><span className="word">QUE</span></div>
      <div className="avatar-chip"><img src={DOG} alt="" />{Ic.chevDown({ s: 13 })}</div>
    </header>
  );
}

function PageHead({ label = 'SOCIAL · 5/28', handle = '@tanishq' }) {
  return (
    <div className="page-head">
      <div className="left"><span className="dot"></span> {label}</div>
      <div className="right">{handle}</div>
    </div>
  );
}

function SecLabel({ children, sq = true, amber = false, rule = false, right = null }) {
  return (
    <div className="section-head" style={right ? null : { marginBottom: rule ? 16 : 16 }}>
      <div className="sec-label">
        <span className={'dot' + (sq ? ' sq' : '') + (amber ? ' amber' : '')}></span>
        {children}
        {rule && <span className="rule"></span>}
      </div>
      {right}
    </div>
  );
}

function BottomNav() {
  const items = [['cal', 'Calendar'], ['food', 'Calories'], ['metrics', 'Metrics'], ['protocol', 'Protocol'], ['social', 'Social']];
  return (
    <nav className="nav">
      {items.map(([k, n]) => (
        <a key={n} className={n === 'Social' ? 'active' : ''}>{Ic[k]()}{n}</a>
      ))}
    </nav>
  );
}

/* ── PROFILE (badge shelf + stat rail) ── */
const BADGES = [
  { ic: '🏋️', lab: 'Iron', gold: true }, { ic: '🔥', lab: '30 day', gold: true },
  { ic: '🦵', lab: 'Leg day', gold: false }, { ic: '⚡', lab: 'PR set', gold: true },
  { ic: '🌅', lab: '5am club', gold: false }, { ic: '💯', lab: '100 logs', gold: true },
  { ic: '🏃', lab: 'Cardio', locked: true }, { ic: '🥇', lab: 'Champion', locked: true },
];

function ProfileCard({ open, onToggle }) {
  return (
    <section className="card">
      <div className="profile">
        <img className="pfp" src={DOG} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">TANISHQ SOMANI</div>
          <div className="handle">@tanishq</div>
          <div className="edit">{Ic.edit()} EDIT PROFILE</div>
        </div>
        <div className="badge-count">
          <div className="n">6</div>
          <div className="l">badges</div>
        </div>
      </div>

      <div className="stat-rail">
        <div className="stat"><div className="v"><span className="flame">{Ic.flame({ s: 16 })}</span>12</div><div className="k">Day streak</div></div>
        <div className="stat"><div className="v">48<small>k lbs</small></div><div className="k">This week</div></div>
        <div className="stat"><div className="v">#3<small>/12</small></div><div className="k">Group rank</div></div>
      </div>

      <div className="shelf-head" onClick={onToggle}>
        <span className="lbl">Gym badges · 6 <span className="coin-chip">🪙 4</span></span>
        <span className={'chev' + (open ? ' open' : '')}>{Ic.chevDown()}</span>
      </div>
      {open && (
        <div className="badge-shelf">
          {BADGES.map((b, i) => (
            <div key={i} className={'medallion' + (b.gold ? ' gold' : '') + (b.locked ? ' locked' : '')}>
              <span className="ic">{b.locked ? '🔒' : b.ic}</span>
              <span className="mlab">{b.lab}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* compact profile (hero variant) */
function ProfileHero() {
  return (
    <section className="card" style={{ paddingBottom: 16 }}>
      <div className="profile">
        <img className="pfp" src={DOG} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">TANISHQ SOMANI</div>
          <div className="handle">@tanishq</div>
          <div className="edit">{Ic.edit()} EDIT PROFILE</div>
        </div>
      </div>
      <div className="stat-rail" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat"><div className="v">6</div><div className="k">Badges</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--warn)' }}>🪙4</div><div className="k">Coins</div></div>
        <div className="stat"><div className="v"><span className="flame">{Ic.flame({ s: 15 })}</span>12</div><div className="k">Streak</div></div>
        <div className="stat"><div className="v">#3</div><div className="k">Rank</div></div>
      </div>
    </section>
  );
}

/* ── GROUP CARDS ── */
function AvStack({ items = [DOG, 'S', BIKE], sm = false }) {
  return (
    <div className={'av-stack' + (sm ? ' sm' : '')}>
      {items.map((it, i) => it.length <= 2
        ? <span key={i} className="av">{it}</span>
        : <img key={i} src={it} alt="" />)}
    </div>
  );
}

function GroupCard({ g, onOpen }) {
  return (
    <div className="gcard" onClick={onOpen}>
      <div className="gcard-top">
        <AvStack items={g.members} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="gname">{g.name}</div>
          <div className="gmeta">{g.count} members · {g.note}</div>
        </div>
        {g.battle && <span className="gribbon battle live">LIVE</span>}
        <span className="chev-r">{Ic.chevR({ s: 18 })}</span>
      </div>

      <div className="gcard-activity">
        <span style={{ color: 'var(--ink-2)' }}>{Ic.bolt({ s: 13 })}</span>
        <span><b>{g.lastBy}</b> {g.lastAct}</span>
        <span className="ago">· {g.ago}</span>
      </div>

      <div className="today-row">
        <span className="tlbl">Logged today</span>
        <span className="streak-flame">{Ic.flame()} {g.streak}</span>
        <span className="day-dots">
          {g.today.map((on, i) => <span key={i} className={'d' + (on ? ' on' : '')}></span>)}
        </span>
        <span className="count-chip" style={{ marginLeft: 4 }}>{Ic.chat({ s: 13 })} {g.comments}</span>
      </div>
    </div>
  );
}

function GroupTile({ g, onOpen }) {
  return (
    <div className="gtile" onClick={onOpen}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <AvStack items={g.members} sm />
        {g.battle && <span className="gribbon battle live" style={{ padding: '4px 8px', fontSize: 10 }}>LIVE</span>}
      </div>
      <div className="gt-name">{g.name}</div>
      <div className="gt-meta">{g.count} members · 🔥 {g.streak}</div>
      <div className="gt-foot">
        <span className="count-chip" style={{ padding: '4px 9px', fontSize: 11 }}>{Ic.chat({ s: 12 })} {g.comments}</span>
        <span className="day-dots" style={{ marginLeft: 'auto' }}>
          {g.today.slice(0, 5).map((on, i) => <span key={i} className={'d' + (on ? ' on' : '')}></span>)}
        </span>
      </div>
    </div>
  );
}

function NewGroupCTA({ onClick }) {
  return (
    <div className="new-group-cta" onClick={onClick}>
      <span className="ng-plus">{Ic.plus({ s: 20 })}</span>
      <div className="ng-txt">
        <div className="t">Start a group</div>
        <div className="s">Train with friends · share daily · run battles</div>
      </div>
    </div>
  );
}

window.QueCore = { DOG, BIKE, BEACH, RUN, StatusBar, TopBar, PageHead, SecLabel, BottomNav, ProfileCard, ProfileHero, AvStack, GroupCard, GroupTile, NewGroupCTA };
