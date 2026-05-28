/* QUE — interactive Social app shell. Routing + sheets. */
const { DOG, BIKE, BEACH, RUN, StatusBar, BottomNav, AvStack } = window.QueCore;
const { PostCard, BattleCard } = window.QueFeed;
const { GROUPS } = window.QueArtboards;

/* ── generic bottom sheet ── */
function Sheet({ open, onClose, title, children }) {
  return (
    <div className={'sheet-wrap' + (open ? ' open' : '')} onClick={onClose} aria-hidden={!open}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab"></div>
        <div className="sheet-head">
          <span className="sheet-title">{title}</span>
          <button className="icon-x" onClick={onClose}>{Ic.x()}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── toast ── */
function Toast({ msg }) {
  return <div className={'toast' + (msg ? ' show' : '')}>{msg}</div>;
}

/* ── profile hero with progressive badge shelf ── */
const BADGES = [
  { ic: '🏋️', lab: 'Iron', gold: true }, { ic: '🔥', lab: '30 day', gold: true },
  { ic: '🦵', lab: 'Leg day' }, { ic: '⚡', lab: 'PR set', gold: true },
  { ic: '🌅', lab: '5am club' }, { ic: '💯', lab: '100 logs', gold: true },
  { ic: '🏃', lab: 'Cardio', locked: true }, { ic: '🥇', lab: 'Champion', locked: true },
];
function Profile({ onEdit }) {
  const [open, setOpen] = React.useState(false);
  return (
    <section className="card">
      <div className="profile">
        <img className="pfp" src={DOG} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">TANISHQ SOMANI</div>
          <div className="handle">@tanishq</div>
          <div className="edit" onClick={onEdit}>{Ic.edit()} EDIT PROFILE</div>
        </div>
        <div className="badge-count"><div className="n">6</div><div className="l">badges</div></div>
      </div>
      <div className="stat-rail" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat"><div className="v"><span className="flame">{Ic.flame({ s: 15 })}</span>12</div><div className="k">Streak</div></div>
        <div className="stat"><div className="v">48<small>k</small></div><div className="k">Wk vol</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--warn)' }}>🪙4</div><div className="k">Coins</div></div>
        <div className="stat"><div className="v">#3</div><div className="k">Rank</div></div>
      </div>
      <div className="shelf-head" onClick={() => setOpen((o) => !o)}>
        <span className="lbl">Gym badges · 6</span>
        <span className={'chev' + (open ? ' open' : '')}>{Ic.chevDown()}</span>
      </div>
      {open && (
        <div className="badge-shelf">
          {BADGES.map((b, i) => (
            <div key={i} className={'medallion' + (b.gold ? ' gold' : '') + (b.locked ? ' locked' : '')}>
              <span className="ic">{b.locked ? '🔒' : b.ic}</span><span className="mlab">{b.lab}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── interactive group card ── */
function GCard({ g, onOpen }) {
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
        <span><b>{g.lastBy}</b> {g.lastAct}</span><span className="ago">· {g.ago}</span>
      </div>
      <div className="today-row">
        <span className="tlbl">Logged today</span>
        <span className="streak-flame">{Ic.flame()} {g.streak}</span>
        <span className="day-dots">{g.today.map((on, i) => <span key={i} className={'d' + (on ? ' on' : '')}></span>)}</span>
        <span className="count-chip" style={{ marginLeft: 4 }}>{Ic.chat({ s: 13 })} {g.comments}</span>
      </div>
    </div>
  );
}

window.QueShell1 = { Sheet, Toast, Profile, GCard };
