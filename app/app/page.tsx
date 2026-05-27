'use client';

import { useState, useEffect } from 'react';
import { Calendar, BarChart2, Layers, Utensils, Users } from 'lucide-react';
import { AuthHeader }    from '@/components/header';
import CalendarScheduler from '@/components/CalendarScheduler';
import MetricsDashboard  from '@/components/MetricsDashboard';
import WorkoutLogger     from '@/components/WorkoutLogger';
import CalorieTracker    from '@/components/CalorieTracker';
import SocialTab         from '@/components/SocialTab';
import { Onboarding, needsOnboarding } from '@/components/Onboarding';
import { MorningWeightPrompt } from '@/components/MorningWeightPrompt';
import { SyncNudge } from '@/components/SyncNudge';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useApp } from '@/lib/AppContext';

type Tab = 'calendar' | 'calories' | 'metrics' | 'protocol' | 'social';

const TABS = [
  { id: 'calendar' as Tab, label: 'Calendar', Icon: Calendar  },
  { id: 'calories' as Tab, label: 'Calories', Icon: Utensils  },
  { id: 'metrics'  as Tab, label: 'Metrics',  Icon: BarChart2 },
  { id: 'protocol' as Tab, label: 'Protocol', Icon: Layers    },
  { id: 'social'   as Tab, label: 'Social',   Icon: Users     },
] as const;

export default function WorkoutPage() {
  const [tab, setTab]                   = useState<Tab>('calendar');
  const [showOnboarding, setOnboarding] = useState(false);
  const { isLoaded }                    = useApp();

  useEffect(() => {
    if (!isLoaded) return;
    setOnboarding(needsOnboarding());
  }, [isLoaded]);

  return (
    <div className="app-shell">
      <AuthHeader />

      <main className="app-content" role="tabpanel">
        {/* Each tab gets its own ErrorBoundary so a single component crash
            isolates to that tab — the bottom nav and other tabs stay live.
            The boundary itself reports to lib/errorReporter so failures
            show up in /api/log/error → Vercel logs. */}
        {tab === 'calendar' && (
          <ErrorBoundary label="Calendar">
            <div className="app-calendar-layout">
              <CalendarScheduler />
              <WorkoutLogger />
            </div>
          </ErrorBoundary>
        )}
        {tab === 'calories' && (
          <ErrorBoundary label="Calories">
            <CalorieTracker />
          </ErrorBoundary>
        )}
        {tab === 'metrics' && (
          <ErrorBoundary label="Metrics">
            <MetricsDashboard />
          </ErrorBoundary>
        )}
        {tab === 'protocol' && (
          <ErrorBoundary label="Protocol">
            <div className="app-protocol-layout">
              <WorkoutLogger />
            </div>
          </ErrorBoundary>
        )}
        {tab === 'social' && (
          <ErrorBoundary label="Social">
            <SocialTab />
          </ErrorBoundary>
        )}
      </main>

      <nav className="app-tabs" role="tablist" aria-label="App navigation">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            data-active={tab === id}
            onClick={() => setTab(id)}
            className="app-tab"
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <SyncNudge />
      {showOnboarding && (
        <Onboarding onComplete={() => setOnboarding(false)} />
      )}
      {!showOnboarding && isLoaded && <MorningWeightPrompt />}
    </div>
  );
}
