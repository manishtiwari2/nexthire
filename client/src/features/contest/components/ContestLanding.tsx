import React from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy, Clock, Users, ListChecks, ArrowLeft, ArrowRight, ShieldCheck, Zap,
  CheckCircle2, Play,
} from 'lucide-react';
import { Card, Badge, Button, DifficultyBadge } from '../../../shared/components/ui';
import { cn } from '../../../shared/lib/cn';
import { formatRemaining } from '../format';

interface ContestLandingProps {
  contest: any;
  participants: any[];
  nowTs: number;
  startMs: number | null;
  endMs: number | null;
  notStarted: boolean;
  alreadyJoined: boolean;
  isJoining: boolean;
  onEnter: () => void;
}

const RULES = [
  { icon: <Zap />, text: 'Solutions are judged in real time against hidden test cases.' },
  { icon: <Trophy />, text: 'Ranked by score first, then by penalty (lower is better).' },
  { icon: <Clock />, text: 'The contest closes automatically when the timer hits zero.' },
  { icon: <ShieldCheck />, text: 'Python, Java, and C++ are supported in the judge.' },
];

export const ContestLanding: React.FC<ContestLandingProps> = ({
  contest, participants, nowTs, startMs, endMs, notStarted, alreadyJoined, isJoining, onEnter,
}) => {
  const questions = contest?.questions || [];
  const totalPoints = questions.reduce((s: number, q: any) => s + (q.points ?? 100), 0);
  const durationMin = startMs != null && endMs != null ? Math.round((endMs - startMs) / 60000) : null;
  const countdown = notStarted && startMs != null ? formatRemaining(startMs - nowTs)
    : endMs != null ? formatRemaining(endMs - nowTs) : 'LIVE';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <Link to="/contests" className="inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface">
          <ArrowLeft className="h-4 w-4" /> Back to Assessments
        </Link>

        {/* Hero */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-outline-variant bg-surface-container-low p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={notStarted ? 'info' : 'danger'} dot pulse={!notStarted}>
                {notStarted ? 'STARTS SOON' : 'LIVE NOW'}
              </Badge>
              {alreadyJoined && <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Registered</Badge>}
              <span className="text-xs text-on-surface-muted">Hosted by {contest?.host?.name || 'NextHire'}</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-on-surface">{contest?.title}</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-on-surface-variant">{contest?.description}</p>
          </div>

          {/* Timer + meta */}
          <div className="grid gap-px bg-outline-variant sm:grid-cols-4">
            {[
              { label: notStarted ? 'Starts in' : 'Ends in', value: countdown, mono: true },
              { label: 'Questions', value: questions.length },
              { label: 'Participants', value: participants.length },
              { label: 'Total points', value: totalPoints },
            ].map((m) => (
              <div key={m.label} className="bg-surface-container-lowest p-4 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wide text-on-surface-muted">{m.label}</p>
                <p className={cn('mt-1 text-xl font-bold text-on-surface', m.mono && 'font-mono tabular-nums text-primary')}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Enter CTA */}
          <div className="flex flex-col items-center gap-2 p-6">
            <Button size="lg" onClick={onEnter} isLoading={isJoining} leftIcon={<Play className="h-4 w-4 fill-current" />} className="w-full sm:w-auto">
              {alreadyJoined ? 'Enter Arena' : 'Join & Enter'}
            </Button>
            {notStarted && <p className="text-xs text-on-surface-muted">You can enter now to read the problems — submissions open when the timer starts.</p>}
            {durationMin != null && <p className="text-xs text-on-surface-muted">Duration: {durationMin} minutes</p>}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Instructions */}
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
              <ListChecks className="h-4 w-4 text-primary" /> Instructions
            </h2>
            <ul className="space-y-2.5">
              {RULES.map((r, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-on-surface-variant">
                  <span className="mt-0.5 text-on-surface-muted [&>svg]:h-4 [&>svg]:w-4">{r.icon}</span>
                  {r.text}
                </li>
              ))}
            </ul>
          </Card>

          {/* Questions */}
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Trophy className="h-4 w-4 text-warning" /> Problems ({questions.length})
            </h2>
            {questions.length ? (
              <div className="space-y-2">
                {questions.map((cq: any, idx: number) => (
                  <div key={cq.id || idx} className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/12 font-mono text-xs font-bold text-primary">{idx + 1}</span>
                      <span className="truncate text-sm font-medium text-on-surface">{cq.question?.title || `Problem ${idx + 1}`}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {cq.question?.difficulty && <DifficultyBadge difficulty={cq.question.difficulty} />}
                      <span className="font-mono text-xs text-on-surface-muted">{cq.points ?? 100}pt</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-on-surface-muted">No problems attached to this assessment.</p>
            )}
          </Card>
        </div>

        {/* Participants */}
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Users className="h-4 w-4 text-tertiary" /> Participants ({participants.length})
          </h2>
          {participants.length ? (
            <div className="flex flex-wrap gap-2">
              {participants.slice(0, 24).map((p, i) => (
                <span key={p.id || i} className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low py-1 pl-1 pr-3">
                  <img
                    src={p.user?.avatarUrl || `https://api.dicebear.com/7.x/glass/svg?seed=${encodeURIComponent(p.user?.name || 'User')}`}
                    alt="" className="h-6 w-6 rounded-full border border-outline-variant object-cover"
                  />
                  <span className="text-xs font-medium text-on-surface-variant">{p.user?.name || 'Engineer'}</span>
                </span>
              ))}
              {participants.length > 24 && <span className="self-center text-xs text-on-surface-muted">+{participants.length - 24} more</span>}
            </div>
          ) : (
            <p className="text-sm text-on-surface-muted">Be the first to join this assessment.</p>
          )}
        </Card>

        <div className="flex justify-center pb-4">
          <Button variant="secondary" onClick={onEnter} isLoading={isJoining} rightIcon={<ArrowRight className="h-4 w-4" />}>
            {alreadyJoined ? 'Enter Arena' : 'Join & Enter'}
          </Button>
        </div>
      </div>
    </div>
  );
};
