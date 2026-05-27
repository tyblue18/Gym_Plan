import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Dumbbell, Bike, Waves, PersonStanding, Award } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { LIFT_PRS_KEY, PROFILE_PHOTO_KEY } from '@/lib/constants';
import queLogo from '@/public/Que_logo.png';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SetData     { reps?: string; weight?: string; }
interface ExerciseEntry {
  k: 'lift' | 'text' | 'run' | 'bike' | 'swim';
  n?: string; g?: string;
  sets?: SetData[];
  s?: string; r?: string; w?: string;
  v1?: string; v2?: string; note?: string;
}
interface DayRecord { exercises?: string; [k: string]: unknown; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseExercises(raw: string | undefined): ExerciseEntry[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as ExerciseEntry[]; }
  catch { return []; }
}

function fmtSets(e: ExerciseEntry): string {
  if (e.sets?.length) {
    const groups: string[] = [];
    let cur = e.sets[0];
    let cnt = 1;
    for (let i = 1; i < e.sets.length; i++) {
      const s = e.sets[i];
      if (s.reps === cur.reps && s.weight === cur.weight) { cnt++; }
      else {
        groups.push(`${cnt > 1 ? `${cnt}×` : ''}${cur.reps ?? '?'} @ ${cur.weight ?? '?'} lbs`);
        cur = s; cnt = 1;
      }
    }
    groups.push(`${cnt > 1 ? `${cnt}×` : ''}${cur.reps ?? '?'} @ ${cur.weight ?? '?'} lbs`);
    return groups.join(', ');
  }
  if (e.s && e.r) return `${e.s}×${e.r}${e.w ? ` @ ${e.w} lbs` : ''}`;
  return '';
}

function fmtCardio(e: ExerciseEntry): string {
  const dist = e.v1 ? `${e.v1} mi` : '';
  const time = e.v2 ? `${e.v2} min` : '';
  return [dist, time].filter(Boolean).join(' · ');
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isImagePath(icon: string) { return icon.startsWith('/'); }

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getProfile(username: string) {
  const user = await prisma.appUser.findUnique({
    where:   { username },
    include: {
      badges:      { orderBy: { earnedAt: 'desc' } },
      workoutData: { select: { localDB: true, settings: true } },
      coinWallet:  { select: { balance: true } },
    },
  });
  if (!user) return null;

  const settings = (user.workoutData?.settings ?? {}) as Record<string, unknown>;
  const localDB  = (user.workoutData?.localDB  ?? {}) as Record<string, DayRecord>;

  const liftPRs = (() => {
    try {
      const raw = settings[LIFT_PRS_KEY];
      if (typeof raw === 'string') return JSON.parse(raw) as Record<string, number>;
      if (raw && typeof raw === 'object') return raw as Record<string, number>;
      return {} as Record<string, number>;
    } catch { return {} as Record<string, number>; }
  })();

  const profilePhoto = (settings[PROFILE_PHOTO_KEY] as string | undefined) ?? null;

  const statusActive = !user.statusExpiresAt || user.statusExpiresAt > new Date();

  // Recent workouts: last 14 days with exercise entries, sorted newest first
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const recentWorkouts = Object.entries(localDB)
    .filter(([date, day]) => date >= cutoffStr && !!day.exercises)
    .map(([date, day]) => ({
      date,
      exercises: parseExercises(day.exercises),
    }))
    .filter(w => w.exercises.filter(e => e.k !== 'text').length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  // Top PRs sorted by weight
  const topPRs = Object.entries(liftPRs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const showcaseSlugs = (user.showcaseBadges as string[] | null) ?? [];
  const badgeMap      = new Map(user.badges.map(b => [b.slug, b]));
  const showcaseBadges = showcaseSlugs
    .map(s => badgeMap.get(s))
    .filter((b): b is NonNullable<typeof b> => !!b);
  const remainingBadges = user.badges
    .filter(b => !showcaseSlugs.includes(b.slug))
    .slice(0, 16);

  return {
    id:       user.id,
    name:     user.name,
    username: user.username,
    status:   statusActive ? user.status : null,
    profilePhoto,
    badgeCount:  user.badges.length,
    coinBalance: user.coinWallet?.balance ?? 0,
    showcaseBadges,
    remainingBadges,
    topPRs,
    recentWorkouts,
  };
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> },
): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return { title: 'Profile not found' };

  const title = `${profile.name ?? profile.username} on Que`;
  const description = `${profile.badgeCount} badge${profile.badgeCount !== 1 ? 's' : ''} · ${profile.topPRs.length} PRs tracked`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'profile' },
    twitter:   { card: 'summary_large_image', title, description },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProfilePage(
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const p = await getProfile(username);
  if (!p) notFound();

  return (
    <div className="pub-shell">
      {/* Nav */}
      <header className="pub-nav">
        <Link href="/" className="pub-nav-brand">
          <Image src={queLogo} alt="Que" width={22} height={22} className="pub-nav-logo" />
          <span className="pub-nav-name">Que</span>
        </Link>
        <Link href="/app" className="pub-nav-cta">Open app</Link>
      </header>

      <main className="pub-main">

        {/* ── Profile header ── */}
        <div className="pub-profile-card">
          <div className="pub-avatar-wrap">
            {p.profilePhoto ? (
              <img src={p.profilePhoto} alt={p.name ?? ''} className="pub-avatar-img" />
            ) : (
              <div className="pub-avatar-placeholder">
                <PersonStanding size={28} />
              </div>
            )}
          </div>
          <div className="pub-profile-info">
            <h1 className="pub-display-name">{p.name ?? p.username}</h1>
            <p className="pub-username">@{p.username}</p>
            {p.status && <p className="pub-status">{p.status}</p>}
            <p className="pub-meta">
              {p.badgeCount} badge{p.badgeCount !== 1 ? 's' : ''}
              {p.topPRs.length > 0 && ` · ${p.topPRs.length} PRs`}
              {p.coinBalance > 0 && ` · 🪙 ${p.coinBalance.toLocaleString()}`}
            </p>
          </div>
        </div>

        {/* ── Badges ── */}
        {(p.showcaseBadges.length > 0 || p.remainingBadges.length > 0) && (
          <section className="pub-section">
            <div className="pub-section-header">
              <Award size={14} />
              <h2 className="pub-section-title">Badges</h2>
            </div>

            {p.showcaseBadges.length > 0 && (
              <>
                <p className="pub-section-sub">Showcase</p>
                <div className="pub-badge-grid pub-badge-grid-lg">
                  {p.showcaseBadges.map(b => (
                    <div key={b.slug} className="pub-badge-item">
                      {isImagePath(b.icon) ? (
                        <img src={b.icon} alt={b.label} className="pub-badge-img pub-badge-img-lg" />
                      ) : (
                        <span className="pub-badge-emoji pub-badge-emoji-lg">{b.icon}</span>
                      )}
                      <span className="pub-badge-label">{b.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {p.remainingBadges.length > 0 && (
              <>
                {p.showcaseBadges.length > 0 && <p className="pub-section-sub">All earned</p>}
                <div className="pub-badge-grid">
                  {p.remainingBadges.map(b => (
                    <div key={b.slug} className="pub-badge-item">
                      {isImagePath(b.icon) ? (
                        <img src={b.icon} alt={b.label} className="pub-badge-img" />
                      ) : (
                        <span className="pub-badge-emoji">{b.icon}</span>
                      )}
                      <span className="pub-badge-label">{b.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* ── Lift PRs ── */}
        {p.topPRs.length > 0 && (
          <section className="pub-section">
            <div className="pub-section-header">
              <Dumbbell size={14} />
              <h2 className="pub-section-title">Lift PRs</h2>
            </div>
            <div className="pub-pr-list">
              {p.topPRs.map(([name, weight]) => (
                <div key={name} className="pub-pr-row">
                  <span className="pub-pr-name">{name}</span>
                  <span className="pub-pr-weight">{weight} lbs</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Recent workouts ── */}
        {p.recentWorkouts.length > 0 && (
          <section className="pub-section">
            <div className="pub-section-header">
              <Dumbbell size={14} />
              <h2 className="pub-section-title">Recent Workouts</h2>
            </div>
            <div className="pub-workout-list">
              {p.recentWorkouts.map(w => {
                const lifts  = w.exercises.filter(e => e.k === 'lift');
                const cardio = w.exercises.filter(e => e.k === 'run' || e.k === 'bike' || e.k === 'swim');
                return (
                  <div key={w.date} className="pub-workout-day">
                    <p className="pub-workout-date">{fmtDate(w.date)}</p>

                    {lifts.length > 0 && (
                      <ul className="pub-exercise-list">
                        {lifts.map((e, i) => (
                          <li key={i} className="pub-exercise-row">
                            <span className="pub-exercise-name">{e.n ?? 'Lift'}</span>
                            <span className="pub-exercise-detail">{fmtSets(e)}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {cardio.length > 0 && (
                      <ul className="pub-exercise-list">
                        {cardio.map((e, i) => {
                          const Icon = e.k === 'bike' ? Bike : e.k === 'swim' ? Waves : PersonStanding;
                          const label = e.k === 'run' ? 'Run' : e.k === 'bike' ? 'Bike' : 'Swim';
                          return (
                            <li key={i} className="pub-exercise-row pub-exercise-row-cardio">
                              <span className="pub-exercise-cardio-icon"><Icon size={12} /></span>
                              <span className="pub-exercise-name">{label}</span>
                              <span className="pub-exercise-detail">{fmtCardio(e)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Footer CTA ── */}
        <div className="pub-footer-cta">
          <p className="pub-footer-text">Track your own training on Que</p>
          <Link href="/" className="pub-footer-btn">Get started free</Link>
        </div>

      </main>
    </div>
  );
}
