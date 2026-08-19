import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Dumbbell, Shuffle, Layers, Building2, CalendarDays, RotateCcw,
  AlertTriangle, Trophy, Timer, ArrowRight, ExternalLink
} from 'lucide-react';
import { SectionHeader, Card, Button, Badge, Spinner, DifficultyBadge } from '../shared/components/ui';
import { PracticeModeCard } from '../features/library/components/PracticeModeCard';
import { LibraryTable } from '../features/library/components/LibraryTable';
import {
  fetchDaily, fetchRandom, fetchMixed, fetchRevisionQueue, fetchWeakTopics, startMock
} from '../features/library/api';
import { useAuthStore } from '../store/useAuthStore';
import type { QuestionCard } from '../features/library/types';

type SetMode = 'random' | 'mixed' | 'mock' | 'revision' | 'weak';

const LABELS: Record<SetMode, string> = {
  random: 'Random problem',
  mixed: 'Mixed interview set',
  mock: 'Timed mock interview',
  revision: 'Revision queue',
  weak: 'Weak topics'
};

async function fetchSet(mode: SetMode): Promise<{ questions: QuestionCard[]; budgetMin?: number }> {
  switch (mode) {
    case 'random': return { questions: await fetchRandom({ count: 5 }) };
    case 'mixed': return { questions: await fetchMixed(5) };
    case 'mock': { const r = await startMock({ count: 3 }); return { questions: r.questions, budgetMin: r.budgetMin }; }
    case 'revision': return { questions: (await fetchRevisionQueue()).map((r) => r.question) };
    case 'weak': return { questions: await fetchWeakTopics() };
  }
}

export const PracticePage: React.FC = () => {
  const { user } = useAuthStore();
  const [mode, setMode] = useState<SetMode | null>(null);

  const { data: daily, isLoading: dailyLoading } = useQuery({ queryKey: ['daily'], queryFn: fetchDaily });
  const { data: revision } = useQuery({ queryKey: ['revision-count'], queryFn: fetchRevisionQueue, enabled: !!user });

  const { data: set, isLoading: setLoading } = useQuery({
    queryKey: ['practice-set', mode],
    queryFn: () => fetchSet(mode!),
    enabled: !!mode
  });

  const dailyQ = daily?.question;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Dumbbell />}
        title="Practice"
        description="Pick a practice mode. Sets are drawn live from the Question Library and tuned to your progress."
      />

      {/* Featured: Daily Challenge */}
      <Card className="overflow-hidden border-primary/30 bg-primary/8 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-on-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-on-surface">Daily Challenge</h3>
                <Badge variant="primary">Today</Badge>
              </div>
              {dailyLoading ? (
                <Spinner size="sm" />
              ) : dailyQ ? (
                <p className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <span className="font-medium text-on-surface">{dailyQ.title}</span>
                  <DifficultyBadge difficulty={dailyQ.difficulty} />
                </p>
              ) : (
                <p className="text-sm text-on-surface-muted">No challenge available yet.</p>
              )}
            </div>
          </div>
          {dailyQ && (
            dailyQ.isExternalOnly && dailyQ.sourceUrl ? (
              <a href={dailyQ.sourceUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="primary" rightIcon={<ExternalLink className="h-4 w-4" />}>Open problem</Button>
              </a>
            ) : (
              <Link to={`/questions/${dailyQ.id}`}>
                <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />}>Solve today</Button>
              </Link>
            )
          )}
        </div>
      </Card>

      {/* Mode grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PracticeModeCard icon={<Shuffle />} title="Random Question" description="Jump into a random problem to stay sharp." onClick={() => setMode('random')} />
        <PracticeModeCard icon={<Layers />} title="Mixed Interview Set" description="A balanced easy→hard set, interview-style." onClick={() => setMode('mixed')} />
        <PracticeModeCard icon={<Timer />} title="Timed Mock Interview" description="A short timed set with a suggested budget." onClick={() => setMode('mock')} />
        <PracticeModeCard
          icon={<RotateCcw />}
          title="Revision Queue"
          description="Spaced-repetition problems due for review."
          badge={user && revision ? <Badge variant={revision.length ? 'warning' : 'default'}>{revision.length} due</Badge> : undefined}
          onClick={() => setMode('revision')}
          disabled={!user}
        />
        <PracticeModeCard icon={<AlertTriangle />} title="Weak Topics" description="Focus on topics you solve least often." onClick={() => setMode('weak')} disabled={!user} />
        <Link to="/library" className="contents">
          <PracticeModeCard icon={<Dumbbell />} title="Topic Practice" description="Filter the library by any DSA topic." />
        </Link>
        <Link to="/library" className="contents">
          <PracticeModeCard icon={<Building2 />} title="Company Practice" description="Practice by company from the library." />
        </Link>
        <Link to="/contests" className="contents">
          <PracticeModeCard icon={<Trophy />} title="Contest Mode" description="Compete in live timed assessments." />
        </Link>
      </div>

      {/* Selected-mode results */}
      {mode && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-on-surface">
              {LABELS[mode]}
              {set?.budgetMin ? <Badge variant="info"><Timer className="h-3 w-3" /> ~{set.budgetMin} min budget</Badge> : null}
            </h2>
            <Button variant="outline" size="sm" onClick={() => setMode(null)}>Clear</Button>
          </div>
          {setLoading ? (
            <div className="flex justify-center py-10"><Spinner label="Building your set…" /></div>
          ) : (
            <LibraryTable
              questions={set?.questions || []}
              invalidate={[['practice-set', mode]]}
              emptyHint={mode === 'revision' ? 'Nothing due for revision — great job!' : 'No problems available for this mode yet.'}
            />
          )}
        </div>
      )}
    </div>
  );
};
