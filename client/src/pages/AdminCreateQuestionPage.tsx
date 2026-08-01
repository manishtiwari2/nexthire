import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { AppLayout } from '../components/layout/AppLayout';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import {
  Button,
  Input,
  Textarea,
  Select,
  Card,
  SectionHeader,
} from '../shared/components/ui';
import { Database, Plus, Trash2, FileText, FlaskConical, Code2, BookOpen, Tags } from 'lucide-react';

const SOURCE_OPTIONS = [
  ['CUSTOM', 'Original / Custom'], ['LEETCODE', 'LeetCode'], ['GEEKSFORGEEKS', 'GeeksforGeeks'],
  ['HACKERRANK', 'HackerRank'], ['CODEFORCES', 'Codeforces'], ['CODECHEF', 'CodeChef'],
  ['ATCODER', 'AtCoder'], ['INTERVIEWBIT', 'InterviewBit']
] as const;

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

  // --- Library metadata ---
  const [subtopics, setSubtopics] = useState('');
  const [companyTags, setCompanyTags] = useState('');
  const [frequencyBand, setFrequencyBand] = useState('');
  const [estimatedTimeMin, setEstimatedTimeMin] = useState('');
  const [sourcePlatform, setSourcePlatform] = useState('CUSTOM');
  const [sourceUrl, setSourceUrl] = useState('');
  const [originalAuthor, setOriginalAuthor] = useState('');
  const [authorNotes, setAuthorNotes] = useState('');
  const [contentStatus, setContentStatus] = useState('PUBLISHED');
  const [isExternalOnly, setIsExternalOnly] = useState(false);

  const csv = (s: string) => s.split(',').map((v) => v.trim()).filter(Boolean);

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
    if (!title.trim()) {
      addToast('Missing Details', 'Title is required', 'warning');
      return;
    }

    const metadata = {
      subtopics: csv(subtopics),
      companyTags: csv(companyTags),
      frequencyBand: frequencyBand || undefined,
      estimatedTimeMin: estimatedTimeMin ? Number(estimatedTimeMin) : undefined,
      sourcePlatform,
      sourceUrl: sourceUrl.trim() || undefined,
      originalAuthor: originalAuthor.trim() || undefined,
      authorNotes: authorNotes.trim() || undefined,
      contentStatus,
      isExternalOnly
    };

    // External references carry metadata + a link only — no local statement, tests, or judge.
    if (isExternalOnly) {
      if (!sourceUrl.trim()) {
        addToast('Missing Source URL', 'External references need a source link', 'warning');
        return;
      }
      createMutation.mutate({
        title: title.trim(),
        difficulty,
        topicName: topicName.trim() || 'Algorithms',
        ...metadata
      });
      return;
    }

    if (!description.trim()) {
      addToast('Missing Details', 'Description is required for a solvable problem', 'warning');
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
      ...(editorialContent.trim() ? { editorialContent: editorialContent.trim() } : {}),
      ...metadata
    });
  };

  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/403" replace />;
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <SectionHeader
          icon={<Database />}
          title="Create Coding Question"
          description="Author a problem with sample and hidden test cases for the judge to evaluate."
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Details */}
          <Card className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <FileText className="h-4 w-4 text-primary" /> Problem Details
            </h3>
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Two Sum" required />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </Select>
              <Input label="Topic" value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="Algorithms" />
            </div>

            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Full problem statement…"
              className="min-h-[120px]"
              required
            />

            <Textarea
              label="Constraints"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="1 <= N <= 10^5"
              mono
              className="min-h-[60px]"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                type="number"
                min={100}
                label="Time Limit (ms)"
                value={timeLimitMs}
                onChange={(e) => setTimeLimitMs(parseInt(e.target.value, 10) || 2000)}
              />
              <Input
                type="number"
                min={16}
                label="Memory Limit (MB)"
                value={memoryLimitMb}
                onChange={(e) => setMemoryLimitMb(parseInt(e.target.value, 10) || 256)}
              />
            </div>
          </Card>

          {/* Library metadata */}
          <Card className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Tags className="h-4 w-4 text-primary" /> Library Metadata{' '}
              <span className="font-normal text-on-surface-variant">(optional)</span>
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Subtopics (comma-separated)" value={subtopics} onChange={(e) => setSubtopics(e.target.value)} placeholder="Hashing, Two Pointers" />
              <Input label="Company tags (comma-separated)" value={companyTags} onChange={(e) => setCompanyTags(e.target.value)} placeholder="Google, Amazon" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select label="Frequency" value={frequencyBand} onChange={(e) => setFrequencyBand(e.target.value)}>
                <option value="">Unset</option>
                <option value="VERY_HIGH">Very High</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </Select>
              <Input type="number" min={1} label="Est. solve time (min)" value={estimatedTimeMin} onChange={(e) => setEstimatedTimeMin(e.target.value)} placeholder="30" />
              <Select label="Revision status" value={contentStatus} onChange={(e) => setContentStatus(e.target.value)}>
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="IN_REVIEW">In review</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Source platform" value={sourcePlatform} onChange={(e) => setSourcePlatform(e.target.value)}>
                {SOURCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <Input label="Source URL" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://leetcode.com/problems/…" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Original author" value={originalAuthor} onChange={(e) => setOriginalAuthor(e.target.value)} placeholder="Author / attribution" />
              <Input label="Author notes" value={authorNotes} onChange={(e) => setAuthorNotes(e.target.value)} placeholder="Internal notes" />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-outline-variant p-3">
              <input type="checkbox" checked={isExternalOnly} onChange={(e) => setIsExternalOnly(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span className="text-sm">
                <span className="font-semibold text-on-surface">External reference only</span>
                <span className="block text-xs text-on-surface-variant">Store metadata + a source link, no local statement/tests. Solvers open the source platform. Requires a source URL.</span>
              </span>
            </label>
          </Card>

          {/* Test cases */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                <FlaskConical className="h-4 w-4 text-primary" /> Test Cases
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={addTestCase} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                Add Case
              </Button>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Sample cases are shown to candidates. Non-sample (hidden) cases are only used for grading.
            </p>

            <div className="space-y-3">
              {testCases.map((tc, idx) => (
                <div key={idx} className="space-y-2 rounded-xl border border-outline-variant p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-on-surface">Case #{idx + 1}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                        <input
                          type="checkbox"
                          checked={tc.isSample}
                          onChange={(e) => updateTestCase(idx, { isSample: e.target.checked })}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        Sample (visible)
                      </label>
                      {testCases.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTestCase(idx)}
                          className="h-7 w-7 text-danger hover:text-danger"
                          aria-label="Remove test case"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Textarea
                      label="Input (stdin)"
                      value={tc.input}
                      onChange={(e) => updateTestCase(idx, { input: e.target.value })}
                      mono
                      className="min-h-[60px]"
                    />
                    <Textarea
                      label="Expected Output"
                      value={tc.expectedOutput}
                      onChange={(e) => updateTestCase(idx, { expectedOutput: e.target.value })}
                      mono
                      className="min-h-[60px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Starter code (optional) */}
          <Card className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Code2 className="h-4 w-4 text-primary" /> Starter Code{' '}
              <span className="font-normal text-on-surface-variant">(optional)</span>
            </h3>
            {STARTER_LANGUAGES.map((l) => (
              <Textarea
                key={l.key}
                label={l.label}
                value={starterCodes[l.key] || ''}
                onChange={(e) => setStarterCodes((prev) => ({ ...prev, [l.key]: e.target.value }))}
                placeholder={l.placeholder}
                mono
                className="min-h-[70px]"
              />
            ))}
          </Card>

          {/* Editorial (optional) */}
          <Card className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <BookOpen className="h-4 w-4 text-primary" /> Editorial{' '}
              <span className="font-normal text-on-surface-variant">(optional)</span>
            </h3>
            <Textarea
              value={editorialContent}
              onChange={(e) => setEditorialContent(e.target.value)}
              placeholder="Official explanation of the intended approach."
              className="min-h-[80px]"
            />
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/questions')}>
              Cancel
            </Button>
            <Button type="submit" size="lg" isLoading={createMutation.isPending} leftIcon={<Database className="h-4 w-4" />}>
              Create Question
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
};
