/* QUE — interactive prototype: router, group feed, sheets, mount. */
const { StatusBar, BottomNav } = window.QueCore;
const { BattleCard } = window.QueFeed;
const { GROUPS } = window.QueArtboards;
const { Sheet, Toast, Profile, GCard } = window.QueShell1;
const { SocialScreen, FRIENDS } = window.QueShell2;
const { WorkoutCard, WORKOUTS } = window.QueWorkout;

const ArrowLeft = (s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>;

/* ── GROUP DETAIL (feed) ── */
function GroupScreen({ group, go, openSheet }) {
  const g = group || GROUPS[0];
  const feed = g.name === 'NN5' ? WORKOUTS : [WORKOUTS[1]];
  return (
    <div className="screen-pad route-enter">
      <header className="topbar">
        <button className="back-btn" onClick={() => go('social', null, true)}>{ArrowLeft(20)}</button>
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

      {g.battle && <div style={{ marginTop: 14 }}><BattleCard /></div>}

      <p className="date-label" style={{ marginTop: 18 }}>{feed[0].date}</p>
      <WorkoutCard w={feed[0]} />
      {feed[1] && <React.Fragment>
        <p className="date-label" style={{ marginTop: 10 }}>{feed[1].date}</p>
        <WorkoutCard w={feed[1]} />
      </React.Fragment>}
      <div style={{ height: 6 }}></div>
    </div>
  );
}

/* ── SHEETS ── */
function NewGroupSheet({ open, onClose, onDone }) {
  const [picked, setPicked] = React.useState([]);
  const toggle = (h) => setPicked((p) => p.includes(h) ? p.filter((x) => x !== h) : [...p, h]);
  return (
    <Sheet open={open} onClose={onClose} title="New group">
      <span className="sheet-label">Group name</span>
      <input className="input" style={{ width: '100%' }} placeholder="e.g. Morning Lifts" />
      <span className="sheet-label">Invite friends</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {FRIENDS.map((f) => (
          <div key={f.handle} className={'invite-chip' + (picked.includes(f.handle) ? ' on' : '')} onClick={() => toggle(f.handle)}>
            {f.av.length <= 2 ? <span className="av" style={{ width: 30, height: 30 }}>{f.av}</span> : <img src={f.av} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} />}
            <div style={{ minWidth: 0 }}><div className="fname" style={{ fontSize: 13 }}>{f.name}</div><div className="fsub">{f.handle}</div></div>
            <span className="ck" style={{ marginLeft: 'auto' }}>{picked.includes(f.handle) && Ic.plus({ s: 12 })}</span>
          </div>
        ))}
      </div>
      <button className="solid-btn" onClick={() => onDone('Group created · ' + (picked.length ? picked.length + ' invited' : 'just you'))}>{Ic.plus({ s: 16 })} Create group</button>
    </Sheet>
  );
}

function BattleSheet({ open, onClose, onDone, payload }) {
  const [type, setType] = React.useState('steps');
  const [range, setRange] = React.useState('3 days');
  const [foe, setFoe] = React.useState(payload ? payload.handle : 'group');
  const types = [['steps', 'Most steps'], ['calories', 'Most calories'], ['diet', 'Diet streak']];
  return (
    <Sheet open={open} onClose={onClose} title="New battle">
      <span className="sheet-label">Compete on</span>
      <div className="opt-row">{types.map(([id, l]) => <button key={id} className={'opt amber' + (type === id ? ' on' : '')} onClick={() => setType(id)}>{l}</button>)}</div>
      <span className="sheet-label">Time frame</span>
      <div className="opt-row">{['1 day', '3 days', '1 week'].map((r) => <button key={r} className={'opt amber' + (range === r ? ' on' : '')} onClick={() => setRange(r)}>{r}</button>)}</div>
      <span className="sheet-label">Opponents</span>
      <div className="opt-row">
        <button className={'opt amber' + (foe === 'group' ? ' on' : '')} onClick={() => setFoe('group')}>Whole group</button>
        {FRIENDS.map((f) => <button key={f.handle} className={'opt amber' + (foe === f.handle ? ' on' : '')} onClick={() => setFoe(f.handle)}>{f.name}</button>)}
      </div>
      <button className="solid-btn" style={{ background: 'var(--warn)', color: '#07080A' }} onClick={() => onDone('Battle started · good luck 💪')}>{Ic.swords({ s: 16 })} Start battle</button>
    </Sheet>
  );
}

function ShareSheet({ open, onClose, onDone }) {
  const w = WORKOUTS[0];
  return (
    <Sheet open={open} onClose={onClose} title="Share today">
      <span className="sheet-label">Today's workout</span>
      <div className="gcard" style={{ cursor: 'default' }}>
        <div className="wc-title-row" style={{ padding: 0 }}>
          <span className="wc-title">{w.title}</span>
          <span className="wc-type">{Ic.bolt({ s: 11 })} {w.type}</span>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 13 }}>
          <div><div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--accent-text)' }}>{w.volume.toLocaleString()}</div><div className="wc-sub">volume lb</div></div>
          <div><div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{w.sets}</div><div className="wc-sub">sets</div></div>
          <div><div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{w.dur}</div><div className="wc-sub">time</div></div>
        </div>
      </div>
      <button className="solid-btn" onClick={() => onDone('Shared to the group 🎉')}>{Ic.plus({ s: 16 })} Share to group</button>
    </Sheet>
  );
}

function EditSheet({ open, onClose, onDone }) {
  return (
    <Sheet open={open} onClose={onClose} title="Edit profile">
      <span className="sheet-label">Display name</span>
      <input className="input" style={{ width: '100%' }} defaultValue="Tanishq somani" />
      <span className="sheet-label">Username</span>
      <input className="input" style={{ width: '100%' }} defaultValue="@tanishq" />
      <button className="solid-btn" onClick={() => onDone('Profile updated')}>Save changes</button>
    </Sheet>
  );
}

/* ── ROUTER ── */
function App() {
  const [route, setRoute] = React.useState('social');
  const [group, setGroup] = React.useState(null);
  const [back, setBack] = React.useState(false);
  const [sheet, setSheet] = React.useState(null);   // {type, payload}
  const [toast, setToast] = React.useState('');
  const scrollRef = React.useRef(null);
  const toastT = React.useRef(0);

  const go = (r, g = null, isBack = false) => { setBack(isBack); setRoute(r); if (g) setGroup(g); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const openSheet = (type, payload = null) => setSheet({ type, payload });
  const closeSheet = () => setSheet(null);
  const done = (msg) => { closeSheet(); clearTimeout(toastT.current); setToast(msg); toastT.current = setTimeout(() => setToast(''), 1900); };

  return (
    <div className="app-frame">
      <div style={{ padding: '0 16px' }}><StatusBar /></div>
      <div className="app-scroll" ref={scrollRef}>
        <div key={route} className={back ? 'route-back' : 'route-enter'}>
          {route === 'social'
            ? <SocialScreen go={go} openSheet={openSheet} />
            : <GroupScreen group={group} go={go} openSheet={openSheet} />}
        </div>
      </div>
      <BottomNav />

      <NewGroupSheet open={sheet?.type === 'newgroup'} onClose={closeSheet} onDone={done} />
      <BattleSheet open={sheet?.type === 'battle'} onClose={closeSheet} onDone={done} payload={sheet?.payload} />
      <ShareSheet open={sheet?.type === 'share'} onClose={closeSheet} onDone={done} />
      <EditSheet open={sheet?.type === 'edit'} onClose={closeSheet} onDone={done} />
      <Toast msg={toast} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
