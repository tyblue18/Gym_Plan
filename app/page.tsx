import Link from 'next/link';
import Image from 'next/image';
import {
  Calendar, Utensils, BarChart2, Users, Zap,
  TrendingUp, Award, Dumbbell,
} from 'lucide-react';
import queLogo from '@/public/Que_logo.png';
import calendarPreview from '@/public/Calendar_preview.png';
import caloriesPreview from '@/public/Calories_preview.png';
import metricsPreview from '@/public/Metrics_preview.png';
import protocolPreview from '@/public/Protocol_preview.png';
import socialPreview from '@/public/Social_preview.png';
import { InstallCTA } from '@/components/landing/InstallCTA';
import { InviteBanner } from '@/components/landing/InviteBanner';

const FEATURES = [
  {
    icon: Calendar,
    title: 'Workout Calendar',
    body: 'Log every lift, set, and rep. Visual month view shows your training density at a glance.',
  },
  {
    icon: Utensils,
    title: 'Calorie Tracker',
    body: 'Search millions of foods, scan barcodes, and hit your macro targets every day.',
  },
  {
    icon: BarChart2,
    title: 'Metrics & Trends',
    body: 'Body weight trends, calorie history, PRs, and a cut/bulk plan with progress tracking.',
  },
  {
    icon: Users,
    title: 'Social & Challenges',
    body: 'Follow friends, compare stats, and wager coins on head-to-head fitness challenges.',
  },
  {
    icon: Zap,
    title: 'Calorie Budget Engine',
    body: 'Mifflin-St Jeor BMR plus real cardio burn — so your daily budget adjusts to what you actually did.',
  },
  {
    icon: Award,
    title: 'Badges & Coins',
    body: 'Earn badges for PRs, streaks, and milestones. Win coins in challenges and spend them on bets.',
  },
] as const;

const STATS = [
  { value: '5', label: 'tabs. One app.' },
  { value: 'PWA', label: 'works offline' },
  { value: '∞', label: 'food database' },
] as const;

const PREVIEWS = [
  { img: calendarPreview, label: 'Calendar', body: 'Log every set, rep, and weight in a clean week view.' },
  { img: caloriesPreview, label: 'Calories', body: 'Search foods, scan barcodes, hit your macros daily.' },
  { img: metricsPreview,  label: 'Metrics',  body: 'Weight trends, PRs, and cut/bulk progress at a glance.' },
  { img: protocolPreview, label: 'Protocol', body: 'Plan workouts and build running training plans.' },
  { img: socialPreview,   label: 'Social',   body: 'Add friends, compare stats, and battle for coins.' },
] as const;

export default function LandingPage() {
  return (
    <div className="lp-shell">
      {/* ── Invite banner (only renders for ?invite=… visitors) ── */}
      <InviteBanner />

      {/* ── Ambient background ── */}
      <div className="lp-bg-glow" aria-hidden="true" />

      {/* ── Nav ── */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <Image src={queLogo} alt="Que" width={28} height={28} className="lp-nav-logo" priority />
            <span className="lp-nav-name">Que</span>
          </div>
          <Link href="/auth/signin" className="lp-nav-cta">
            Sign in
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-hero-badge">
            <Dumbbell size={12} aria-hidden="true" />
            <span>Athlete OS</span>
          </div>

          <h1 className="lp-hero-title">
            Train.<br />Eat.<br />Repeat.
          </h1>

          <p className="lp-hero-sub">
            Que is a personal training log and calorie tracker built for athletes
            who take their data seriously. Log workouts, hit macros, track your
            cut or bulk, and compete with friends.
          </p>

          <div className="lp-hero-actions">
            <InstallCTA className="lp-btn-primary" />
            <Link href="/app" className="lp-btn-ghost">
              Try without account
            </Link>
          </div>
          <p className="lp-hero-no-account">
            No sign-up needed — your data saves locally. Sign in later to sync across devices.
          </p>

          <div className="lp-stats">
            {STATS.map(({ value, label }) => (
              <div key={label} className="lp-stat">
                <span className="lp-stat-value">{value}</span>
                <span className="lp-stat-label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lp-features">
        <div className="lp-features-inner">
          <p className="lp-section-label">Everything in one place</p>
          <h2 className="lp-section-title">Built for the daily grind</h2>

          <div className="lp-feature-grid">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="lp-feature-card">
                <div className="lp-feature-icon">
                  <Icon size={18} aria-hidden="true" />
                </div>
                <h3 className="lp-feature-title">{title}</h3>
                <p className="lp-feature-body">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product previews ── */}
      <section className="lp-previews">
        <div className="lp-previews-inner">
          <p className="lp-section-label">See it in action</p>
          <h2 className="lp-section-title">Every tab, dialed in</h2>
        </div>
        <div className="lp-preview-strip">
          {PREVIEWS.map(({ img, label, body }) => (
            <figure key={label} className="lp-preview-card">
              <div className="lp-preview-frame">
                <Image
                  src={img}
                  alt={`${label} screen in the Que app`}
                  placeholder="blur"
                  sizes="(max-width: 640px) 66vw, 240px"
                  className="lp-preview-img"
                />
              </div>
              <figcaption className="lp-preview-cap">
                <span className="lp-preview-label">{label}</span>
                <span className="lp-preview-body">{body}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="lp-cta-band">
        <div className="lp-cta-inner">
          <TrendingUp size={32} className="lp-cta-icon" aria-hidden="true" />
          <h2 className="lp-cta-title">Ready to level up?</h2>
          <p className="lp-cta-sub">Free. No ads. Your data stays yours.</p>
          <InstallCTA className="lp-btn-primary lp-btn-lg" label="Start tracking" />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <span>© {new Date().getFullYear()} Que</span>
        <Link href="/about" className="lp-footer-link">About</Link>
        <Link href="/privacy" className="lp-footer-link">Privacy</Link>
        <Link href="/terms" className="lp-footer-link">Terms</Link>
        <Link href="/app" className="lp-footer-link">Open app</Link>
      </footer>
    </div>
  );
}
