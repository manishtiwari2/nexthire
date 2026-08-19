import React, { useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import {
  Button,
  Input,
  Textarea,
  Card,
  SectionHeader,
  DifficultyBadge,
  Spinner,
  EmptyState,
} from '../shared/components/ui';
import { cn } from '../shared/lib/cn';
import { Trophy, Clock, ListChecks, FileText, CheckCircle2, Key, ArrowRight, Database } from 'lucide-react';

// Admin flow: create a contest (steps 3–5 of the interview journey) — pick questions,
// set a duration, and get a join code participants can enter with.
export const AdminCreateContestPage: React.FC = () => {
  const { user } = useAuthStore();
  const { addToast } = useNotificationStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startMode, setStartMode] = useState<'now' | 'schedule'>('now');
  const [scheduledStart, setScheduledStart] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [selected, setSelected] = useState<string[]>([]);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [createdContestId, setCreatedContestId] = useState<string | null>(null);

  const { data: questionsData, isLoading: questionsLoading } = useQuery({
    queryKey: ['questions', 'contest-picker'],
    queryFn: () => apiClient.get('/questions', { params: { limit: 100 } })
  });
  const questions = (questionsData as any)?.data || [];

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post('/contests', payload),
    onSuccess: (res: any) => {
      const contest = res.data;
      setJoinCode(contest?.joinCode || contest?.invites?.[0]?.code || null);
      setCreatedContestId(contest?.id || null);
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      addToast('Assessment Created', 'Your contest is ready. Share the join code with participants.', 'success');
    },
    onError: (err: any) => {
      addToast('Creation Failed', String(err) || 'Could not create the assessment', 'error');
    }
  });

  const toggleQuestion = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]));
  };

  const startTime = useMemo(
    () => (startMode === 'now' ? new Date() : scheduledStart ? new Date(scheduledStart) : null),
    [startMode, scheduledStart]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      addToast('Missing Details', 'Title and description are required', 'warning');
      return;
    }
    if (selected.length === 0) {
      addToast('No Questions Selected', 'Select at least one question for the assessment', 'warning');
      return;
    }
    if (startMode === 'schedule' && !scheduledStart) {
      addToast('Missing Start Time', 'Pick a start date/time or choose "Start now"', 'warning');
      return;
    }
    if (!durationMinutes || durationMinutes < 1) {
      addToast('Invalid Duration', 'Duration must be at least 1 minute', 'warning');
      return;
    }

    const start = startTime as Date;
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    createMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      questionIds: selected
    });
  };

  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/403" replace />;
  }

  // Success screen: show the join code + let the host enter the live IDE.
  if (joinCode || createdContestId) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-container text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-on-surface">Assessment Created</h1>
            <p className="text-sm text-on-surface-variant">
              Share this join code with participants so they can enter the live IDE.
            </p>
          </div>

          {joinCode && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-high px-6 py-3 font-mono text-xl font-bold tracking-widest text-on-surface">
              <Key className="h-5 w-5 text-warning" /> {joinCode}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate('/contests')}>
              Back to Assessments
            </Button>
            {createdContestId && (
              <Button rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(`/contest/${createdContestId}`)}>
                Enter Contest IDE
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeader
        icon={<Trophy />}
        title="Create New Assessment"
        description="Configure a timed coding contest, pick its questions, and generate a join code."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic details */}
        <Card className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <FileText className="h-4 w-4 text-primary" /> Assessment Details
          </h3>
          <Input
            label="Assessment Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Backend Engineer Screen — Round 1"
            required
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this assessment covers and any instructions for candidates."
            required
          />
        </Card>

        {/* Timing */}
        <Card className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Clock className="h-4 w-4 text-primary" /> Duration & Start
          </h3>
          <div className="flex gap-3">
            <Button
              type="button"
              fullWidth
              variant={startMode === 'now' ? 'primary' : 'outline'}
              onClick={() => setStartMode('now')}
            >
              Start Now
            </Button>
            <Button
              type="button"
              fullWidth
              variant={startMode === 'schedule' ? 'primary' : 'outline'}
              onClick={() => setStartMode('schedule')}
            >
              Schedule
            </Button>
          </div>

          {startMode === 'schedule' && (
            <Input
              type="datetime-local"
              label="Start Date & Time"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
            />
          )}

          <Input
            type="number"
            min={1}
            label="Duration (minutes)"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
            hint={`The contest ends automatically ${durationMinutes || 0} minutes after it starts.`}
          />
        </Card>

        {/* Question selection */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <ListChecks className="h-4 w-4 text-primary" /> Select Questions
            </h3>
            <span className="text-xs font-semibold text-primary">{selected.length} selected</span>
          </div>

          {questionsLoading ? (
            <div className="py-6">
              <Spinner label="Loading questions…" />
            </div>
          ) : questions.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title="No questions yet"
              description="No questions in the bank yet. Create a question first."
              action={<Button onClick={() => navigate('/admin/questions/create')}>Create Question</Button>}
            />
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {questions.map((q: any) => {
                const checked = selected.includes(q.id);
                return (
                  <label
                    key={q.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all',
                      checked
                        ? 'border-primary bg-primary/10'
                        : 'border-outline-variant hover:bg-surface-container-high'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleQuestion(q.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-on-surface">{q.title}</p>
                      <p className="text-[11px] text-on-surface-variant">{q.topic?.name || '—'}</p>
                    </div>
                    <DifficultyBadge difficulty={q.difficulty} />
                  </label>
                );
              })}
            </div>
          )}
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/contests')}>
            Cancel
          </Button>
          <Button type="submit" size="lg" isLoading={createMutation.isPending} leftIcon={<Trophy className="h-4 w-4" />}>
            Create Assessment
          </Button>
        </div>
      </form>
    </div>
  );
};
