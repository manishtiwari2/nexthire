import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { AppHeader } from '../components/layout/AppHeader';
import { AppSidebar } from '../components/layout/AppSidebar';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { Button } from '../shared/components/ui/Button';
import { Input } from '../shared/components/ui/Input';
import { Database, Plus, Trash2 } from 'lucide-react';

interface TestCaseDraft {
  input: string;
  expectedOutput: string;
  isSample: boolean;
}

// Languages the judge can execute — starter code is offered for each.
const STARTER_LANGUAGES = [
  { key: 'PYTHON', label: 'Python', placeholder: 'def solution():\n    pass' },
  { key: 'CPP', label: 'C++', placeholder: '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    return 0;\n}' },
  { key: 'JAVA', label: 'Java', placeholder: 'public class Main {\n    public static void main(String[] args) {\n    }\n}' }
];

// Admin flow: author a coding question (step 2 of the interview journey) with sample and
// hidden test cases the real judge will run.
export const AdminCreateQuestionPage: React.FC = () => {
  const { user } = useAuthStore();
  const { addToast } = useNotificationStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('EASY');
  const [topicName, setTopicName] = useState('Algorithms');
  const [description, setDescription] = useState('');
  const [constraints, setConstraints] = useState('');
  const [timeLimitMs, setTimeLimitMs] = useState(2000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(256);
  const [starterCodes, setStarterCodes] = useState<Record<string, string>>({});
  const [testCases, setTestCases] = useState<TestCaseDraft[]>([
    { input: '', expectedOutput: '', isSample: true }
  ]);
  const [editorialContent, setEditorialContent] = useState('');

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post('/questions', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      addToast('Question Created', 'The question is now in the bank and can be added to assessments.', 'success');
      navigate('/questions');
    },
    onError: (err: any) => {
      addToast('Creation Failed', String(err) || 'Could not create the question', 'error');
    }
  });

  const updateTestCase = (idx: number, patch: Partial<TestCaseDraft>) => {
    setTestCases((prev) => prev.map((tc, i) => (i === idx ? { ...tc, ...patch } : tc)));
  };
  const addTestCase = () => setTestCases((prev) => [...prev, { input: '', expectedOutput: '', isSample: false }]);
  const removeTestCase = (idx: number) => setTestCases((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      addToast('Missing Details', 'Title and description are required', 'warning');
      return;
    }
    const validCases = testCases.filter((tc) => tc.expectedOutput.trim() !== '' || tc.input.trim() !== '');
    if (validCases.length === 0) {
      addToast('No Test Cases', 'Add at least one test case with an expected output', 'warning');
      return;
    }
    if (!validCases.some((tc) => tc.isSample)) {
      addToast('No Sample Case', 'Mark at least one test case as a visible sample', 'warning');
      return;
    }

    const starterCodeArray = STARTER_LANGUAGES
      .filter((l) => starterCodes[l.key]?.trim())
      .map((l) => ({ language: l.key, template: starterCodes[l.key] }));

    createMutation.mutate({
      title: title.trim(),
      difficulty,
      topicName: topicName.trim() || 'Algorithms',
      description: description.trim(),
      constraints: constraints.trim() || '1 <= N <= 10^5',
      timeLimitMs,
      memoryLimitMb,
      starterCodes: starterCodeArray.length ? starterCodeArray : undefined,
      testCases: validCases.map((tc, i) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isSample: tc.isSample,
        orderIndex: i
      })),
      ...(editorialContent.trim() ? { editorialContent: editorialContent.trim() } : {})
    });
  };

  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/403" replace />;
  }

  const textareaCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-xs text-on-surface font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none';

  return (
    <div className="min-h-screen bg-surface">
      <AppSidebar />
      <AppHeader />

      <main className="ml-[260px] pt-16 p-8 space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" /> Create Coding Question
          </h1>
          <p className="text-sm text-on-surface-variant">Author a problem with sample and hidden test cases for the judge to evaluate.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Details */}
          <div className="bg-white border border-outline-variant rounded-3xl p-6 shadow-sm space-y-4">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Two Sum" required />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface">Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-xs text-on-surface outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
              <Input label="Topic" value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="Algorithms" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-on-surface">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Full problem statement…" className={`${textareaCls} min-h-[120px] font-sans`} required />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-on-surface">Constraints</label>
              <textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="1 <= N <= 10^5" className={`${textareaCls} min-h-[60px]`} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface">Time Limit (ms)</label>
                <input type="number" min={100} value={timeLimitMs} onChange={(e) => setTimeLimitMs(parseInt(e.target.value, 10) || 2000)} className={textareaCls} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface">Memory Limit (MB)</label>
                <input type="number" min={16} value={memoryLimitMb} onChange={(e) => setMemoryLimitMb(parseInt(e.target.value, 10) || 256)} className={textareaCls} />
              </div>
            </div>
          </div>

          {/* Test cases */}
          <div className="bg-white border border-outline-variant rounded-3xl p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-on-surface">Test Cases</h3>
              <Button type="button" variant="outline" size="sm" onClick={addTestCase}>
                <Plus className="w-3.5 h-3.5" /> Add Case
              </Button>
            </div>
            <p className="text-[11px] text-on-surface-variant">Sample cases are shown to candidates. Non-sample (hidden) cases are only used for grading.</p>

            <div className="space-y-3">
              {testCases.map((tc, idx) => (
                <div key={idx} className="p-3 border border-outline-variant rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-on-surface">Case #{idx + 1}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-on-surface-variant cursor-pointer">
                        <input type="checkbox" checked={tc.isSample} onChange={(e) => updateTestCase(idx, { isSample: e.target.checked })} className="accent-primary w-3.5 h-3.5" />
                        Sample (visible)
                      </label>
                      {testCases.length > 1 && (
                        <button type="button" onClick={() => removeTestCase(idx)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-on-surface-variant">Input (stdin)</label>
                      <textarea value={tc.input} onChange={(e) => updateTestCase(idx, { input: e.target.value })} className={`${textareaCls} min-h-[60px]`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-on-surface-variant">Expected Output</label>
                      <textarea value={tc.expectedOutput} onChange={(e) => updateTestCase(idx, { expectedOutput: e.target.value })} className={`${textareaCls} min-h-[60px]`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Starter code (optional) */}
          <div className="bg-white border border-outline-variant rounded-3xl p-6 shadow-sm space-y-3">
            <h3 className="font-bold text-sm text-on-surface">Starter Code <span className="font-normal text-on-surface-variant">(optional)</span></h3>
            {STARTER_LANGUAGES.map((l) => (
              <div key={l.key} className="space-y-1">
                <label className="text-xs font-bold text-on-surface">{l.label}</label>
                <textarea
                  value={starterCodes[l.key] || ''}
                  onChange={(e) => setStarterCodes((prev) => ({ ...prev, [l.key]: e.target.value }))}
                  placeholder={l.placeholder}
                  className={`${textareaCls} min-h-[70px]`}
                />
              </div>
            ))}
          </div>

          {/* Editorial (optional) */}
          <div className="bg-white border border-outline-variant rounded-3xl p-6 shadow-sm space-y-1">
            <label className="text-xs font-bold text-on-surface">Editorial <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <textarea value={editorialContent} onChange={(e) => setEditorialContent(e.target.value)} placeholder="Official explanation of the intended approach." className={`${textareaCls} min-h-[80px] font-sans`} />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/questions')}>Cancel</Button>
            <Button type="submit" isLoading={createMutation.isPending} size="lg">
              <Database className="w-4 h-4" /> Create Question
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};
