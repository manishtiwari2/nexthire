import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { MonacoCodeEditor } from '../components/editor/MonacoCodeEditor';
import { SubmissionHistoryPanel } from '../features/question-bank/components/SubmissionHistoryPanel';
import { RevisionScheduleCard } from '../features/revision/components/RevisionScheduleCard';
import { ArrowLeft, Code2, Clock, Lightbulb, BookOpen, FileText, History, RotateCcw } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';

export const LivePracticePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'description' | 'hints' | 'editorial' | 'history' | 'revision'>('description');
  const [autosaveStatus, setAutosaveStatus] = useState('Saved');
  const { code, setCode, language } = useEditorStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: () => apiClient.get(`/questions/${id}`),
    enabled: !!id
  });

  // Fetch past submission history for candidate
  const { data: submissionsData, isLoading: isSubmissionsLoading } = useQuery({
    queryKey: ['submissions', id],
    queryFn: () => apiClient.get(`/questions/${id}/submissions`),
    enabled: !!id
  });

  const question = data?.data;
  const submissions = submissionsData?.data || [];

  // Autosave code draft to LocalStorage with 1000ms debounce
  useEffect(() => {
    if (!id || !code) return;
    setAutosaveStatus('Saving...');
    const timer = setTimeout(() => {
      localStorage.setItem(`nexthire_draft_${id}_${language}`, code);
      setAutosaveStatus('Saved');
    }, 1000);
    return () => clearTimeout(timer);
  }, [code, id, language]);

  // Restore saved draft on mount
  useEffect(() => {
    if (!id || !question) return;
    const savedDraft = localStorage.getItem(`nexthire_draft_${id}_${language}`);
    if (savedDraft) {
      setCode(savedDraft);
    } else if (question.starterCodes) {
      const match = question.starterCodes.find((sc: any) => sc.language?.toLowerCase() === language.toLowerCase());
      if (match && match.template) {
        setCode(match.template);
      }
    }
  }, [question, id, language]);

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-outline-variant px-6 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Link to="/questions" className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-primary" />
            <h1 className="font-bold text-sm text-on-surface">{question?.title || 'Practice Problem'}</h1>
          </div>
          {question && (
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
              question.difficulty === 'EASY' ? 'bg-emerald-100 text-emerald-800' :
              question.difficulty === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
            }`}>
              {question.difficulty}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
            Autosave: {autosaveStatus}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-primary" /> Limit: {question?.timeLimitMs || 2000}ms
          </span>
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left: Problem Details & Tabs */}
        <div className="w-[45%] bg-white rounded-2xl border border-outline-variant flex flex-col overflow-hidden shadow-sm">
          {/* Navigation Tabs */}
          <div className="flex items-center border-b border-outline-variant bg-surface-container-low px-4 gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('description')}
              className={`py-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'description' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" /> Description
            </button>

            <button
              onClick={() => setActiveTab('hints')}
              className={`py-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'hints' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Lightbulb className="w-4 h-4" /> Hints ({question?.hints?.length || 0})
            </button>

            <button
              onClick={() => setActiveTab('editorial')}
              className={`py-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'editorial' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BookOpen className="w-4 h-4" /> Editorial
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`py-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <History className="w-4 h-4" /> History
            </button>

            <button
              onClick={() => setActiveTab('revision')}
              className={`py-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'revision' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <RotateCcw className="w-4 h-4 text-purple-600" /> SM-2
            </button>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {isLoading ? (
              <p className="text-xs text-slate-500">Loading problem details...</p>
            ) : !question ? (
              <p className="text-xs text-slate-500">Question not found.</p>
            ) : activeTab === 'description' ? (
              <>
                <div>
                  <h2 className="text-xl font-bold text-on-surface mb-1">{question.title}</h2>
                  <span className="text-xs font-semibold text-primary">{question.topic?.name || 'Algorithms'}</span>
                </div>

                <div className="text-xs leading-relaxed text-on-surface-variant whitespace-pre-wrap">
                  {question.description}
                </div>

                {question.constraints && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <h4 className="font-bold text-xs text-slate-700">Constraints:</h4>
                    <pre className="text-[11px] text-slate-600 font-mono whitespace-pre-wrap">{question.constraints}</pre>
                  </div>
                )}

                {/* Sample Testcases */}
                {question.testCases && question.testCases.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="font-bold text-xs text-slate-800">Sample Inputs & Expected Outputs:</h4>
                    {question.testCases.map((tc: any, i: number) => (
                      <div key={tc.id || i} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs font-mono">
                        <p className="font-bold text-slate-700">Example {i + 1}:</p>
                        <p className="text-[11px] text-slate-600">Input: {tc.input}</p>
                        <p className="text-[11px] text-slate-600">Expected: {tc.expectedOutput}</p>
                        {tc.explanation && <p className="text-[10px] text-slate-500 italic font-sans mt-1">Explanation: {tc.explanation}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : activeTab === 'hints' ? (
              <div className="space-y-3">
                <h3 className="font-bold text-sm text-slate-800">Problem Hints</h3>
                {question.hints && question.hints.length > 0 ? (
                  question.hints.map((h: any, i: number) => (
                    <div key={h.id || i} className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1">
                      <p className="font-bold">Hint #{i + 1}</p>
                      <p>{h.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No hints available for this problem.</p>
                )}
              </div>
            ) : activeTab === 'editorial' ? (
              <div className="space-y-3 text-xs leading-relaxed">
                <h3 className="font-bold text-sm text-slate-800">Official Editorial & Solution</h3>
                {question.editorial ? (
                  <div className="space-y-2">
                    <p className="whitespace-pre-wrap">{question.editorial.content}</p>
                    {question.editorial.solution && (
                      <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] overflow-x-auto">
                        {question.editorial.solution}
                      </pre>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Official editorial not published yet.</p>
                )}
              </div>
            ) : activeTab === 'history' ? (
              <SubmissionHistoryPanel
                submissions={submissions}
                isLoading={isSubmissionsLoading}
                onSelectSubmission={(loadedCode) => setCode(loadedCode)}
              />
            ) : (
              <RevisionScheduleCard questionId={id || ''} />
            )}
          </div>
        </div>

        {/* Right: Monaco Editor */}
        <div className="w-[55%] h-full">
          <MonacoCodeEditor questionId={id} />
        </div>
      </div>
    </div>
  );
};
