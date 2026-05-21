'use client';

import { useState } from 'react';
import { Calendar, BarChart2, Layers } from 'lucide-react';
import { AuthHeader } from '@/components/header';
import CalendarScheduler from '@/components/CalendarScheduler';
import MetricsDashboard from '@/components/MetricsDashboard';
import WorkoutLogger from '@/components/WorkoutLogger';

type Tab = 'calendar' | 'metrics' | 'protocol';

const TABS = [
  { id: 'calendar' as Tab, label: 'Calendar', Icon: Calendar  },
  { id: 'metrics'  as Tab, label: 'Metrics',  Icon: BarChart2 },
  { id: 'protocol' as Tab, label: 'Protocol', Icon: Layers    },
] as const;

export default function WorkoutPage() {
  const [tab, setTab] = useState<Tab>('calendar');

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
        {tab === 'metrics'  && <MetricsDashboard />}
        {tab === 'protocol' && (
          <div className="app-protocol-layout">
            <WorkoutLogger />
          </div>
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
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
