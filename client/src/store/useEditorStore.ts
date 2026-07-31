import { create } from 'zustand';

export type SupportedLanguage = 'python' | 'javascript' | 'typescript' | 'cpp' | 'java' | 'go';
export type EditorTheme = 'vs-dark' | 'light' | 'nord';

// Lifecycle phases surfaced in the IDE while the judge works. Driven by Socket.IO events
// (with a polling fallback), never fabricated.
export type JudgePhase = 'IDLE' | 'QUEUED' | 'COMPILING' | 'RUNNING' | 'DONE';

export interface JudgeTestResult {
  index: number;
  isSample: boolean;
  verdict: string;
  executionTime?: number | null;
  memoryUsed?: number | null;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  expectedOutput?: string;
}

export interface ExecutionResult {
  status: string;
  output: string;
  error?: string;
  compilerOutput?: string;
  stderr?: string;
  exitCode?: number | null;
  executionTime?: number;
  memoryUsed?: number;
  passCount?: number;
  totalTestCases?: number;
  testResults?: JudgeTestResult[];
}

interface EditorState {
  language: SupportedLanguage;
  theme: EditorTheme;
  fontSize: number;
  code: string;
  isExecuting: boolean;
  phase: JudgePhase;
  result: ExecutionResult | null;
  setLanguage: (lang: SupportedLanguage) => void;
  setTheme: (theme: EditorTheme) => void;
  setFontSize: (size: number) => void;
  setCode: (code: string) => void;
  setIsExecuting: (status: boolean) => void;
  setPhase: (phase: JudgePhase) => void;
  setResult: (res: ExecutionResult | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  language: 'python',
  theme: 'vs-dark',
  fontSize: 14,
  code: '',
  isExecuting: false,
  phase: 'IDLE',
  result: null,

  setLanguage: (language) => set({ language }),
  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
  setCode: (code) => set({ code }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setPhase: (phase) => set({ phase }),
  setResult: (result) => set({ result })
}));
