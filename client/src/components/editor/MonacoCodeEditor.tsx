import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore, SupportedLanguage, JudgePhase } from '../../store/useEditorStore';
import { Play, RotateCcw, CheckCircle, AlertCircle, Clock, Cpu, Send, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { io, Socket } from 'socket.io-client';
import { awaitVerdict } from '../../api/judgeClient';
import { useNotificationStore } from '../../store/useNotificationStore';

interface MonacoCodeEditorProps {
  questionId?: string;
  roomCode?: string;
  contestId?: string;
  onSubmitted?: () => void;
}

// Maps our editor language ids to Monaco's built-in language ids.
const MONACO_LANGUAGE_MAP: Record<SupportedLanguage, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  cpp: 'cpp',
  java: 'java',
  go: 'go'
};

const PHASE_LABEL: Record<JudgePhase, string> = {
  IDLE: '',
  QUEUED: 'Queued…',
  COMPILING: 'Compiling…',
  RUNNING: 'Running test cases…',
  DONE: ''
};

export const MonacoCodeEditor: React.FC<MonacoCodeEditorProps> = ({ questionId, roomCode, contestId, onSubmitted }) => {
  const {
    language, theme, fontSize, code, isExecuting, phase, result,
    setLanguage, setTheme, setCode, setIsExecuting, setPhase, setResult
  } = useEditorStore();
  const socketRef = useRef<Socket | null>(null);
  const { addToast } = useNotificationStore();
  const busy = isExecuting;

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
  }, [roomCode]);

  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);
    if (socketRef.current && roomCode) {
      socketRef.current.emit('code-change', { roomCode, code: newCode, language });
    }
  };

  // Shared run/submit flow. The verdict comes entirely from the real judge — via Socket.IO
  // events when available, falling back to polling — never fabricated on the client.
  const runJudge = async (endpoint: string) => {
    if (!questionId) {
      addToast('No Question Selected', 'Open a coding question to run against its test cases.', 'warning');
      return;
    }
    setIsExecuting(true);
    setResult(null);
    setPhase('QUEUED');
    try {
      const res: any = await apiClient.post(endpoint, { questionId, code, language });
      const submissionId = res.data.submissionId;
      const verdict = await awaitVerdict(submissionId, (p) => setPhase(p));
      setResult(verdict);
    } catch (err: any) {
      setResult({
        status: 'INTERNAL_ERROR',
        output: String(err?.message || err),
        error: String(err)
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

  const accepted = result?.status === 'ACCEPTED';

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Editor Top Bar */}
      <div className="h-12 bg-[#252525] border-b border-[#333] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            className="bg-[#1e1e1e] text-white text-xs font-mono border border-slate-700 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary outline-none cursor-pointer"
          >
            <option value="python">Python 3.10</option>
            <option value="cpp">C++ 20 (GCC)</option>
            <option value="java">Java 17 (OpenJDK)</option>
            <option value="javascript">JavaScript (Node.js)</option>
            <option value="typescript">TypeScript</option>
            <option value="go">Go 1.21</option>
          </select>

          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            className="bg-[#1e1e1e] text-white text-xs font-mono border border-slate-700 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary outline-none cursor-pointer"
          >
            <option value="vs-dark">VS Dark</option>
            <option value="light">VS Light</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {busy && phase !== 'DONE' && (
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300 mr-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {PHASE_LABEL[phase] || 'Working…'}
            </span>
          )}

          <button
            onClick={() => setCode('# Write your solution here\n')}
            className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
            title="Reset Code"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleRunCode}
            disabled={busy}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 border border-slate-700"
          >
            <Play className="w-3.5 h-3.5 fill-current text-blue-400" />
            <span>{busy ? 'Judging…' : 'Run Code'}</span>
          </button>

          <button
            onClick={handleSubmitCode}
            disabled={busy}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{busy ? 'Judging…' : 'Submit Code'}</span>
          </button>
        </div>
      </div>

      {/* Monaco Surface */}
      <div className="flex-1 min-h-[350px]">
        <Editor
          height="100%"
          language={MONACO_LANGUAGE_MAP[language] || 'javascript'}
          theme={theme}
          value={code}
          onChange={handleCodeChange}
          options={{
            fontSize: fontSize,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            fontFamily: 'JetBrains Mono, monospace'
          }}
        />
      </div>

      {/* Live judging banner */}
      {busy && !result && (
        <div className="border-t border-[#333] bg-[#181825] px-4 py-3 text-xs font-mono text-amber-300 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {PHASE_LABEL[phase] || 'Submitting to the judge…'}
        </div>
      )}

      {/* Output Console Panel */}
      {result && (
        <div className="border-t border-[#333] bg-[#181825] p-4 text-xs font-mono space-y-2 max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              {accepted ? (
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <CheckCircle className="w-4 h-4" /> ACCEPTED
                  {typeof result.passCount === 'number' && (
                    <> ({result.passCount}/{result.totalTestCases} Test Cases Passed)</>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-400 font-bold">
                  <AlertCircle className="w-4 h-4" /> {result.status}
                  {typeof result.passCount === 'number' && typeof result.totalTestCases === 'number' && result.totalTestCases > 0 && (
                    <> ({result.passCount}/{result.totalTestCases} Passed)</>
                  )}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-400" />
                {result.executionTime != null ? `${result.executionTime}ms` : '—'}
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-purple-400" />
                {result.memoryUsed != null ? `${result.memoryUsed} MB` : '—'}
              </span>
            </div>
          </div>

          {/* Compiler errors */}
          {result.status === 'COMPILATION_ERROR' && result.compilerOutput && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-amber-400 mb-1">Compiler Output</p>
              <pre className="text-amber-200 whitespace-pre-wrap leading-relaxed">{result.compilerOutput}</pre>
            </div>
          )}

          {/* Runtime stderr */}
          {result.status !== 'COMPILATION_ERROR' && result.stderr && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-red-400 mb-1">Stderr</p>
              <pre className="text-red-300 whitespace-pre-wrap leading-relaxed">{result.stderr}</pre>
            </div>
          )}

          {/* Program stdout */}
          {result.output && result.status !== 'COMPILATION_ERROR' && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Output</p>
              <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed">{result.output}</pre>
            </div>
          )}

          {/* Sample test breakdown (hidden cases are never returned by the API) */}
          {Array.isArray(result.testResults) && result.testResults.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-slate-800">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Sample Test Cases</p>
              {result.testResults.map((t) => (
                <div key={t.index} className="flex items-center gap-2 text-[11px]">
                  {t.verdict === 'ACCEPTED'
                    ? <CheckCircle className="w-3 h-3 text-emerald-400" />
                    : <AlertCircle className="w-3 h-3 text-red-400" />}
                  <span className="text-slate-400">Case #{t.index + 1}</span>
                  <span className={t.verdict === 'ACCEPTED' ? 'text-emerald-400' : 'text-red-400'}>{t.verdict}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
