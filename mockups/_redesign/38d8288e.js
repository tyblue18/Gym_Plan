/* QUE — screens + router. */
const { DOG, BIKE, BEACH, RUN, StatusBar, BottomNav, AvStack } = window.QueCore;
const { PostCard, BattleCard } = window.QueFeed;
const { GROUPS } = window.QueArtboards;
const { Sheet, Toast, Profile, GCard } = window.QueShell1;

const FRIENDS = [
  { name: 'shan lalani', handle: '@shanthenaan', badges: 1, av: 'S' },
  { name: 'maya r', handle: '@mayalifts', badges: 4, av: BEACH },
  { name: 'dev p', handle: '@devsquats', badges: 2, av: BIKE },
];

/* compact active-battles strip */
function BattleStrip({ onOpen }) {
  return (
    <section className="card">
      <div className="section-head">
        <div className="sec-label"><span className="dot sq amber"></span> BATTLES <span className="rule"></span></div>
      </div>
      <div className="battle-strip">
        <div className="bchip" onClick={() => onOpen(GROUPS[0])}>
          <div className="bc-type">{Ic.steps({ s: 12 })} Steps · 3 days</div>
          <div className="bc-title">NN5 step race</div>
          <div className="bc-foot"><div className="bc-pos">2<small>nd / 3</small></div><span className="gribbon battle live" style={{ padding: '3px 8px', fontSize: 10 }}>1d left</span></div>
        </div>
        <div className="bchip" onClick={() => onOpen(GROUPS[1])}>
          <div className="bc-type">{Ic.bolt({ s: 12 })} Diet · 1 week</div>
          <div className="bc-title">Clean week vs shan</div>
          <div className="bc-foot"><div className="bc-pos">1<small>st / 2</small></div><span className="gribbon battle live" style={{ padding: '3px 8px', fontSize: 10 }}>4d left</span></div>
        </div>
      </div>
    </section>
  );
}

function Friends({ onBattle }) {
  return (
    <section className="card">
      <div className="section-head"><div className="sec-label"><span className="dot sq"></span> FRIENDS <span className="rule"></span></div></div>
      <div className="add-row">
        <input className="input" placeholder="@username" />
        <button className="btn-add">{Ic.addUser()} Add</button>
      </div>
      {FRIENDS.map((f) => (
        <div className="friend-row" key={f.handle}>
          {f.av.length <= 2 ? <span className="fav txt">{f.av}</span> : <img className="fav" src={f.av} alt="" />}
          <div style={{ minWidth: 0 }}><div className="fname">{f.name}</div><div className="fsub">{f.handle} · {f.badges} badge{f.badges > 1 ? 's' : ''}</div></div>
          <div className="actions">
            <button className="ghost-btn amber" onClick={() => onBattle(f)}>{Ic.swords({ s: 13 })} Battle</button>
            <button className="icon-x">{Ic.x()}</button>
          </div>
        </div>
      ))}
    </section>
  );
}

/* ── SOCIAL screen ── */
function SocialScreen({ go, openSheet }) {
  return (
    <React.Fragment>
      <header className="topbar">
        <div className="brand"><span className="logo"></span><span className="word">QUE</span></div>
        <div className="avatar-chip"><img src={DOG} alt="" />{Ic.chevDown({ s: 13 })}</div>
      </header>
      <div className="page-head"><div className="left"><span className="dot"></span> SOCIAL · 5/28</div><div className="right">@tanishq</div></div>

      <Profile onEdit={() => openSheet('edit')} />

      <section className="card">
        <div className="section-head">
          <div className="sec-label"><span className="dot sq"></span> GROUPS</div>
          <button className="ghost-btn" onClick={() => openSheet('newgroup')}>{Ic.plus()} New Group</button>
        </div>
        {GROUPS.map((g) => <GCard key={g.name} g={g} onOpen={() => go('group', g)} />)}
        <div className="new-group-cta" style={{ marginTop: 11 }} onClick={() => openSheet('newgroup')}>
          <span className="ng-plus">{Ic.plus({ s: 20 })}</span>
          <div className="ng-txt"><div className="t">Start a group</div><div className="s">Train with friends · share daily · run battles</div></div>
        </div>
      </section>

      <BattleStrip onOpen={(g) => go('group', g)} />
      <Friends onBattle={(f) => openSheet('battle', f)} />
    </React.Fragment>
  );
}

/* ── GROUP DETAIL screen ── */
function GroupScreen({ group, go, openSheet }) {
  const g = group || GROUPS[0];
  return (
    <React.Fragment>
      <header className="topbar">
        <button className="icon-btn" onClick={() => go('social')}>{Ic.chevR ? <span style={{ transform: 'rotate(180deg)', display: 'flex' }}>{Ic.chevR({ s: 24 })}</span> : null}</button>
        <button className="icon-btn">{Ic.settings()}</button>
      </header>

      <section className="card group-head" style={{ marginTop: 4 }}>
        <div className="av-stack">{g.members.map((m, i) => m.length <= 2
          ? <span key={i} className="av" style={{ width: 44, height: 44, fontSize: 15 }}>{m}</span>
          : <img key={i} src={m} alt="" style={{ width: 44, height: 44 }} />)}</div>
        <div><div className="group-name">{g.name}</div><div className="group-meta">{g.count} members · est. May '26</div></div>
      </section>

      <div className="gh-actions">
        <button className="solid-btn" onClick={() => openSheet('share')}>{Ic.plus({ s: 17 })} Share Today</button>
        <button className="ghost-btn amber" onClick={() => openSheet('battle')}>{Ic.swords({ s: 17 })} Battle</button>
      </div>

      <div style={{ marginTop: 14 }}><BattleCard /></div>

      <p className="date-label">TUE 5/26</p>
      <PostCard />
      <div style={{ height: 8 }}></div>
    </React.Fragment>
  );
}

window.QueShell2 = { SocialScreen, GroupScreen, FRIENDS };
