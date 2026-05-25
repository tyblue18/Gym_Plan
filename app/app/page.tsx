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
        {tab === 'calendar' && (
          <div className="app-calendar-layout">
            <CalendarScheduler />
            <WorkoutLogger />
          </div>
        )}
        {tab === 'calories' && <CalorieTracker />}
        {tab === 'metrics'  && <MetricsDashboard />}
        {tab === 'protocol' && (
          <div className="app-protocol-layout">
            <WorkoutLogger />
          </div>
        )}
        {tab === 'social' && <SocialTab />}
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

      {showOnboarding && (
        <Onboarding onComplete={() => setOnboarding(false)} />
      )}
      <MorningWeightPrompt />
    </div>
  );
}
