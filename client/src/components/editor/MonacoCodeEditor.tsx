import React, { useEffect, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useEditorStore, SupportedLanguage, JudgePhase } from '../../store/useEditorStore';
import {
  Play, RotateCcw, CheckCircle, AlertCircle, Clock, Cpu, Send, Loader2,
  Minus, Plus, WrapText, Maximize2, Minimize2, Check, BookOpen,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { io, Socket } from 'socket.io-client';
import { awaitVerdict } from '../../api/judgeClient';
import { useNotificationStore } from '../../store/useNotificationStore';
import { Button } from '../../shared/components/ui';
import { cn } from '../../shared/lib/cn';
import { StarterCode } from '../../shared/lib/starterTemplates';
import { useEditorSession } from '../../shared/hooks/useEditorSession';
import { LanguageDocsPanel } from './LanguageDocsPanel';

interface MonacoCodeEditorProps {
  questionId?: string;
  roomCode?: string;
  contestId?: string;
  onSubmitted?: () => void;
  /** The question's starter templates, so Reset restores the right per-language skeleton. */
  starterCodes?: StarterCode[];
  /** When set, Run/Submit are disabled (e.g. the contest has ended) and this reason is shown. */
  disabledReason?: string;
}

// Maps our editor language ids to Monaco's built-in language ids.
const MONACO_LANGUAGE_MAP: Record<SupportedLanguage, string> = {
  python: 'python',
  cpp: 'cpp',
  java: 'java',
};

const PHASE_LABEL: Record<JudgePhase, string> = {
  IDLE: '',
  QUEUED: 'Queued…',
  COMPILING: 'Compiling…',
  RUNNING: 'Running test cases…',
  DONE: '',
};

const toolbarSelect =
  'h-8 rounded-lg border border-outline-variant bg-surface-container px-2.5 text-xs font-medium text-on-surface ' +
  'outline-none transition-colors hover:border-outline focus:border-primary focus:ring-2 focus:ring-primary/25 ' +
  'cursor-pointer [&>option]:bg-surface-container';

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant ' +
  'transition-colors hover:border-outline hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40';

export const MonacoCodeEditor: React.FC<MonacoCodeEditorProps> = ({
  questionId, roomCode, contestId, onSubmitted, starterCodes, disabledReason,
}) => {
  const {
    language, theme, fontSize, code, isExecuting, phase, result,
    setLanguage, setTheme, setFontSize, setCode, setIsExecuting, setPhase, setResult,
  } = useEditorStore();
  const socketRef = useRef<Socket | null>(null);
  const { addToast } = useNotificationStore();
  const locked = Boolean(disabledReason);
  const busy = isExecuting;

  const [wordWrap, setWordWrap] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  // Per-(question, language) draft load + autosave + result reset. Fixes the contest IDE,
  // which previously shared one global buffer across every problem.
  const { saveState, resetToStarter } = useEditorSession(questionId, starterCodes);

  // Live collaboration socket (only when inside a room). Authenticated so the server accepts it.
  useEffect(() => {
    if (!roomCode) return;
    const token = localStorage.getItem('nexthire_access_token');
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', { auth: { token } });
    socketRef.current = socket;
    socket.emit('join-room', { roomCode, userName: 'User' });
    socket.on('code-update', ({ code: newCode, language: newLang }) => {
      if (newCode && newCode !== code) setCode(newCode);
      if (newLang && newLang !== language) setLanguage(newLang);
    });
    return () => {
      socket.off('code-update');
      socket.disconnect();
    };
    // Intentionally keyed on roomCode only: the socket connects/disconnects with the room, and
    // reconnecting on every code/language keystroke would drop the collaboration session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);
    if (socketRef.current && roomCode) {
      socketRef.current.emit('code-change', { roomCode, code: newCode, language });
    }
  };

  // Shared run/submit flow. Reads the freshest code/language from the store (not a stale
  // closure) so keyboard-shortcut invocations always judge what's on screen. The verdict comes
  // entirely from the real judge — via Socket.IO events with a polling fallback — never faked.
  const runJudge = async (endpoint: string) => {
    if (locked) {
      addToast('Submissions Closed', disabledReason || 'This session is no longer accepting code.', 'warning');
      return;
    }
    if (!questionId) {
      addToast('No Question Selected', 'Open a coding question to run against its test cases.', 'warning');
      return;
    }
    if (useEditorStore.getState().isExecuting) return; // guard against double-fire
    const { code: freshCode, language: freshLang } = useEditorStore.getState();
    setIsExecuting(true);
    setResult(null);
    setPhase('QUEUED');
    try {
      const res: any = await apiClient.post(endpoint, { questionId, code: freshCode, language: freshLang });
      const submissionId = res.data.submissionId;
      const verdict = await awaitVerdict(submissionId, (p) => setPhase(p));
      setResult(verdict);
    } catch (err: any) {
      setResult({
        status: 'INTERNAL_ERROR',
        output: String(err?.message || err),
        error: String(err),
      });
    } finally {
      setPhase('DONE');
      setIsExecuting(false);
    }
  };

  const handleRunCode = () => runJudge(`/questions/${questionId}/execute`);
  const handleSubmitCode = async () => {
    await runJudge(contestId ? `/contests/${contestId}/submit` : `/questions/${questionId}/execute`);
    if (onSubmitted) onSubmitted();
  };

  // Keep the latest handlers in refs so Monaco commands (bound once on mount) never go stale.
  const runRef = useRef(handleRunCode);
  const submitRef = useRef(handleSubmitCode);
  runRef.current = handleRunCode;
  submitRef.current = handleSubmitCode;

  const handleEditorMount: OnMount = (editor, monaco) => {
    // Ctrl/Cmd+Enter → Run,  Ctrl/Cmd+Shift+Enter → Submit (matches LeetCode).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => submitRef.current()
    );
  };

  const accepted = result?.status === 'ACCEPTED';
  const bumpFont = (delta: number) => setFontSize(Math.max(10, Math.min(24, fontSize + delta)));

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elev-2',
        fullscreen ? 'fixed inset-2 z-50 h-auto' : 'h-full'
      )}
    >
      {/* Editor top bar */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-low px-3">
        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            aria-label="Language"
            className={cn(toolbarSelect, 'font-mono')}
          >
            <option value="python">Python 3.10</option>
            <option value="cpp">C++ 20 (GCC)</option>
            <option value="java">Java 17 (OpenJDK)</option>
          </select>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            aria-label="Editor theme"
            className={cn(toolbarSelect, 'hidden lg:block')}
          >
            <option value="vs-dark">VS Dark</option>
            <option value="light">VS Light</option>
          </select>

          {/* Font size stepper */}
          <div className="hidden items-center rounded-lg border border-outline-variant bg-surface-container sm:flex">
            <button className={cn(iconBtn, 'h-8 w-7 rounded-r-none border-0')} onClick={() => bumpFont(-1)} title="Decrease font size" aria-label="Decrease font size">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-6 text-center font-mono text-[11px] text-on-surface-variant tabular-nums">{fontSize}</span>
            <button className={cn(iconBtn, 'h-8 w-7 rounded-l-none border-0')} onClick={() => bumpFont(1)} title="Increase font size" aria-label="Increase font size">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Word wrap */}
          <button
            className={cn(iconBtn, 'hidden sm:flex', wordWrap && 'border-primary/40 bg-primary/12 text-primary')}
            onClick={() => setWordWrap((w) => !w)}
            title={wordWrap ? 'Word wrap: on' : 'Word wrap: off'}
            aria-label="Toggle word wrap"
            aria-pressed={wordWrap}
          >
            <WrapText className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Autosave indicator */}
          <span
            className={cn(
              'mr-0.5 hidden items-center gap-1 text-[11px] font-medium md:flex',
              saveState === 'saved' ? 'text-on-surface-muted' : 'text-warning'
            )}
            title="Your draft is saved locally per question & language"
          >
            {saveState === 'saved' ? <Check className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saveState === 'saved' ? 'Saved' : 'Saving…'}
          </span>

          {busy && phase !== 'DONE' && (
            <span className="mr-1 hidden items-center gap-1.5 text-[11px] font-semibold text-warning sm:flex">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {PHASE_LABEL[phase] || 'Working…'}
            </span>
          )}

          <button
            className={cn(iconBtn, showDocs && 'border-primary/40 bg-primary/12 text-primary')}
            onClick={() => setShowDocs((d) => !d)}
            title="Language reference (I/O & syntax cheatsheet)"
            aria-label="Toggle language reference"
            aria-pressed={showDocs}
          >
            <BookOpen className="h-4 w-4" />
          </button>
          <button className={cn(iconBtn)} onClick={resetToStarter} title="Reset to starter code" aria-label="Reset to starter code">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            className={cn(iconBtn, 'hidden sm:flex')}
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen editor'}
            aria-label="Toggle fullscreen editor"
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRunCode}
            disabled={busy || locked}
            title={locked ? disabledReason : 'Run sample tests (Ctrl+Enter)'}
            leftIcon={<Play className="h-3.5 w-3.5 fill-current text-primary" />}
          >
            {busy ? 'Judging…' : 'Run'}
          </Button>

          <Button
            size="sm"
            onClick={handleSubmitCode}
            disabled={busy || locked}
            title={locked ? disabledReason : 'Submit against all tests (Ctrl+Shift+Enter)'}
            leftIcon={<Send className="h-3.5 w-3.5" />}
          >
            {busy ? 'Judging…' : 'Submit'}
          </Button>
        </div>
      </div>

      {/* Locked banner (e.g. contest ended) */}
      {locked && (
        <div className="flex items-center gap-2 border-b border-danger/30 bg-error-container/50 px-4 py-2 text-[11px] font-semibold text-danger">
          <AlertCircle className="h-3.5 w-3.5" /> {disabledReason}
        </div>
      )}

      {/* Monaco surface */}
      <div className="min-h-[320px] flex-1">
        <Editor
          height="100%"
          language={MONACO_LANGUAGE_MAP[language] || 'javascript'}
          theme={theme}
          value={code}
          onChange={handleCodeChange}
          onMount={handleEditorMount}
          options={{
            fontSize: fontSize,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 14, bottom: 14 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            renderLineHighlight: 'all',
            wordWrap: wordWrap ? 'on' : 'off',
            tabSize: 4,
            fontFamily: 'JetBrains Mono, monospace',
            fontLigatures: true,
          }}
        />
      </div>

      {/* Live judging banner */}
      {busy && !result && (
        <div className="flex items-center gap-2 border-t border-outline-variant bg-surface-container px-4 py-3 font-mono text-xs text-warning">
          <Loader2 className="h-4 w-4 animate-spin" />
          {PHASE_LABEL[phase] || 'Submitting to the judge…'}
        </div>
      )}

      {/* Output console */}
      {result && (
        <div className="max-h-64 shrink-0 space-y-2 overflow-y-auto border-t border-outline-variant bg-surface-container p-4 font-mono text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant pb-2">
            {accepted ? (
              <span className="flex items-center gap-1.5 font-bold text-success">
                <CheckCircle className="h-4 w-4" /> ACCEPTED
                {typeof result.passCount === 'number' && (
                  <span className="font-normal text-on-surface-variant">
                    ({result.passCount}/{result.totalTestCases} passed)
                  </span>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-bold text-danger">
                <AlertCircle className="h-4 w-4" /> {(result.status || '').replace(/_/g, ' ')}
                {typeof result.passCount === 'number' && typeof result.totalTestCases === 'number' && result.totalTestCases > 0 && (
                  <span className="font-normal text-on-surface-variant">
                    ({result.passCount}/{result.totalTestCases} passed)
                  </span>
                )}
              </span>
            )}

            <div className="flex items-center gap-4 text-[11px] text-on-surface-muted">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-primary" />
                {result.executionTime != null ? `${result.executionTime}ms` : '—'}
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3 text-tertiary" />
                {result.memoryUsed != null ? `${result.memoryUsed} MB` : '—'}
              </span>
            </div>
          </div>

          {/* Compiler errors */}
          {result.status === 'COMPILATION_ERROR' && result.compilerOutput && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-warning">Compiler Output</p>
              <pre className="whitespace-pre-wrap leading-relaxed text-on-warning-container">{result.compilerOutput}</pre>
            </div>
          )}

          {/* Runtime stderr */}
          {result.status !== 'COMPILATION_ERROR' && result.stderr && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-danger">Stderr</p>
              <pre className="whitespace-pre-wrap leading-relaxed text-on-error-container">{result.stderr}</pre>
            </div>
          )}

          {/* Program stdout */}
          {result.output && result.status !== 'COMPILATION_ERROR' && result.output !== 'Execution complete.' && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-on-surface-muted">Output</p>
              <pre className="whitespace-pre-wrap leading-relaxed text-on-surface-variant">{result.output}</pre>
            </div>
          )}

          {/* Sample test breakdown (hidden cases are never returned by the API) */}
          {Array.isArray(result.testResults) && result.testResults.length > 0 && (
            <div className="space-y-2 border-t border-outline-variant pt-2">
              <p className="text-[10px] uppercase tracking-wide text-on-surface-muted">Sample Test Cases</p>
              {result.testResults.map((t) => {
                const ok = t.verdict === 'ACCEPTED';
                return (
                  <div key={t.index} className="rounded-lg border border-outline-variant bg-surface-container-low p-2">
                    <div className="flex items-center gap-2 text-[11px]">
                      {ok ? <CheckCircle className="h-3 w-3 text-success" /> : <AlertCircle className="h-3 w-3 text-danger" />}
                      <span className="text-on-surface-muted">Case #{t.index + 1}</span>
                      <span className={ok ? 'text-success' : 'text-danger'}>{(t.verdict || '').replace(/_/g, ' ')}</span>
                    </div>
                    {/* On a failed sample, show expected vs got so the user can debug immediately. */}
                    {!ok && (t.expectedOutput || t.stdout) && (
                      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                        <div>
                          <span className="mb-0.5 block text-[9px] uppercase tracking-wide text-on-surface-muted">Expected</span>
                          <pre className="whitespace-pre-wrap break-words rounded bg-surface-container-lowest p-1.5 text-[11px] text-success">{t.expectedOutput || '—'}</pre>
                        </div>
                        <div>
                          <span className="mb-0.5 block text-[9px] uppercase tracking-wide text-on-surface-muted">Your Output</span>
                          <pre className="whitespace-pre-wrap break-words rounded bg-surface-container-lowest p-1.5 text-[11px] text-danger">{t.stdout || '—'}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Slide-over language reference (generic syntax help, never solution hints) */}
      <LanguageDocsPanel open={showDocs} language={language} onClose={() => setShowDocs(false)} />
    </div>
  );
};
