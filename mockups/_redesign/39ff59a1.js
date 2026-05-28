/* QUE redesign — artboards (screens) composed from shared components. */
const { DOG, BIKE, BEACH, RUN, StatusBar, TopBar, PageHead, SecLabel, BottomNav,
  ProfileCard, ProfileHero, GroupCard, GroupTile, NewGroupCTA } = window.QueCore;
const { BattleCard, BattleStrip, FriendsCard, PostCard } = window.QueFeed;

const GROUPS = [
  { name: 'NN5', members: [DOG, 'S', BIKE], count: 3, note: 'leg day', lastBy: 'Tanishq', lastAct: 'shared a leg day', ago: '2h', streak: '5d', today: [1, 1, 0], comments: 1, battle: true },
  { name: 'MORNING LIFTS', members: ['M', RUN, DOG, 'K'], count: 6, note: 'push / pull / legs', lastBy: 'maya r', lastAct: 'hit a squat PR', ago: '20m', streak: '11d', today: [1, 1, 1, 1, 0, 1], comments: 4, battle: false },
  { name: 'SUNDAY RUN CLUB', members: [BIKE, RUN, 'J'], count: 4, note: 'easy miles', lastBy: 'dev p', lastAct: 'logged 8.2 mi', ago: '1d', streak: '3d', today: [0, 1, 0, 0], comments: 0, battle: false },
];

/* small helper for the GROUPS section header */
function GroupsHead() {
  return (
    <div className="section-head">
      <div className="sec-label"><span className="dot sq"></span> GROUPS</div>
      <button className="ghost-btn">{Ic.plus()} New Group</button>
    </div>
  );
}

/* ───────────────────────── DIRECTION A · Refined ───────────────────────── */
function SocialRefined() {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="screen">
      <StatusBar /><TopBar /><PageHead />
      <ProfileCard open={open} onToggle={() => setOpen((o) => !o)} />
      <section className="card">
        <GroupsHead />
        <GroupCard g={GROUPS[0]} />
      </section>
      <BattleStrip />
      <FriendsCard />
      <BottomNav />
    </div>
  );
}

/* ──────────────────── DIRECTION B · Activity-forward ──────────────────── */
function SocialActivity() {
  return (
    <div className="screen">
      <StatusBar /><TopBar /><PageHead />
      <ProfileHero />
      <section className="card">
        <GroupsHead />
        {GROUPS.map((g) => <GroupCard key={g.name} g={g} />)}
        <div style={{ marginTop: 11 }}><NewGroupCTA /></div>
      </section>
      <BattleStrip />
      <FriendsCard />
      <BottomNav />
    </div>
  );
}

/* ──────────────────────── DIRECTION C · Arcade grid ──────────────────────── */
function SocialArcade() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="screen">
      <StatusBar /><TopBar /><PageHead />
      <ProfileCard open={open} onToggle={() => setOpen((o) => !o)} />
      <section className="card">
        <GroupsHead />
        <div className="group-grid">
          {GROUPS.map((g) => <GroupTile key={g.name} g={g} />)}
          <div className="gtile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: 'var(--line-3)', gap: 8, minHeight: 120 }}>
            <span className="ng-plus" style={{ width: 38, height: 38 }}>{Ic.plus({ s: 18 })}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.5px' }}>New group</span>
          </div>
        </div>
      </section>
      <BattleCard />
      <FriendsCard />
      <BottomNav />
    </div>
  );
}

/* ─────────────────────────── GROUP DETAIL ─────────────────────────── */
function GroupDetail() {
  return (
    <div className="screen">
      <StatusBar />
      <header className="topbar">
        <button className="icon-btn">{Ic.x({ s: 24 })}</button>
        <button className="icon-btn">{Ic.settings()}</button>
      </header>

      <section className="card group-head" style={{ marginTop: 4 }}>
        <div className="av-stack"><img src={DOG} alt="" /><span className="av" style={{ width: 44, height: 44, fontSize: 15 }}>S</span><img src={BIKE} alt="" style={{ width: 44, height: 44 }} /></div>
        <div>
          <div className="group-name">NN5</div>
          <div className="group-meta">3 members · est. May '26</div>
        </div>
      </section>

      <div className="gh-actions">
        <button className="solid-btn">{Ic.plus({ s: 17 })} Share Today</button>
        <button className="ghost-btn amber">{Ic.swords({ s: 17 })} Battle</button>
      </div>

      <div style={{ marginTop: 14 }}>
        <BattleCard />
      </div>

      <p className="date-label">TUE 5/26</p>
      <PostCard />
      <div style={{ height: 8 }}></div>
    </div>
  );
}

window.QueArtboards = { SocialRefined, SocialActivity, SocialArcade, GroupDetail, GROUPS };
