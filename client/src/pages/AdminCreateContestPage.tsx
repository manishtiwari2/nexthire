import React, { useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { AppHeader } from '../components/layout/AppHeader';
import { AppSidebar } from '../components/layout/AppSidebar';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { Button } from '../shared/components/ui/Button';
import { Input } from '../shared/components/ui/Input';
import { Trophy, Clock, CheckCircle2, Key, ArrowRight } from 'lucide-react';

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
      <div className="min-h-screen bg-surface">
        <AppSidebar />
        <AppHeader />
        <main className="ml-[260px] pt-16 p-8 max-w-2xl mx-auto">
          <div className="bg-white border border-outline-variant rounded-3xl p-8 shadow-sm text-center space-y-5">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-on-surface">Assessment Created</h1>
              <p className="text-sm text-on-surface-variant mt-1">Share this join code with participants so they can enter the live IDE.</p>
            </div>

            {joinCode && (
              <div className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-mono text-xl font-bold rounded-2xl tracking-widest">
                <Key className="w-5 h-5 text-amber-400" /> {joinCode}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate('/contests')}>Back to Assessments</Button>
              {createdContestId && (
                <Button onClick={() => navigate(`/contest/${createdContestId}`)}>
                  <span>Enter Contest IDE</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppSidebar />
      <AppHeader />

      <main className="ml-[260px] pt-16 p-8 space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" /> Create New Assessment
          </h1>
          <p className="text-sm text-on-surface-variant">Configure a timed coding contest, pick its questions, and generate a join code.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic details */}
          <div className="bg-white border border-outline-variant rounded-3xl p-6 shadow-sm space-y-4">
            <Input label="Assessment Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Backend Engineer Screen — Round 1" required />
            <div className="space-y-1 w-full">
              <label className="text-xs font-bold text-on-surface">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this assessment covers and any instructions for candidates."
                className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-xs text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none min-h-[80px]"
                required
              />
            </div>
          </div>

          {/* Timing */}
          <div className="bg-white border border-outline-variant rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-on-surface flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Duration & Start</h3>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStartMode('now')}
                className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${startMode === 'now' ? 'bg-primary text-white border-primary' : 'bg-white border-outline-variant text-on-surface-variant'}`}>
                Start Now
              </button>
              <button type="button" onClick={() => setStartMode('schedule')}
                className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${startMode === 'schedule' ? 'bg-primary text-white border-primary' : 'bg-white border-outline-variant text-on-surface-variant'}`}>
                Schedule
              </button>
            </div>

            {startMode === 'schedule' && (
              <div className="space-y-1 w-full">
                <label className="text-xs font-bold text-on-surface">Start Date & Time</label>
                <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-xs text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            )}

            <div className="space-y-1 w-full">
              <label className="text-xs font-bold text-on-surface">Duration (minutes)</label>
              <input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-xs text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              <p className="text-[11px] text-on-surface-variant">The contest ends automatically {durationMinutes || 0} minutes after it starts.</p>
            </div>
          </div>

          {/* Question selection */}
          <div className="bg-white border border-outline-variant rounded-3xl p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-on-surface">Select Questions</h3>
              <span className="text-xs font-bold text-primary">{selected.length} selected</span>
            </div>

            {questionsLoading ? (
              <p className="text-xs text-slate-500">Loading questions…</p>
            ) : questions.length === 0 ? (
              <p className="text-xs text-slate-500">No questions in the bank yet. Create a question first.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {questions.map((q: any) => {
                  const checked = selected.includes(q.id);
                  return (
                    <label key={q.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checked ? 'border-primary bg-primary/5' : 'border-outline-variant hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleQuestion(q.id)} className="accent-primary w-4 h-4" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-on-surface">{q.title}</p>
                        <p className="text-[11px] text-on-surface-variant">{q.topic?.name || 'Algorithms'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        q.difficulty === 'EASY' ? 'bg-emerald-100 text-emerald-800' :
                        q.difficulty === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                      }`}>{q.difficulty}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/contests')}>Cancel</Button>
            <Button type="submit" isLoading={createMutation.isPending} size="lg">
              <Trophy className="w-4 h-4" /> Create Assessment
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};
