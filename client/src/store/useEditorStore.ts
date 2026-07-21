import { create } from 'zustand';

export type SupportedLanguage = 'python' | 'javascript' | 'cpp';
export type EditorTheme = 'vs-dark' | 'light' | 'nord';

interface ExecutionResult {
  status: string;
  output: string;
  error?: string;
  executionTime?: number;
  memoryUsed?: number;
  passCount?: number;
  totalTestCases?: number;
}

interface EditorState {
  language: SupportedLanguage;
  theme: EditorTheme;
  fontSize: number;
  code: string;
  isExecuting: boolean;
  result: ExecutionResult | null;
  setLanguage: (lang: SupportedLanguage) => void;
  setTheme: (theme: EditorTheme) => void;
  setFontSize: (size: number) => void;
  setCode: (code: string) => void;
  setIsExecuting: (status: boolean) => void;
  setResult: (res: ExecutionResult | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  language: 'python',
  theme: 'vs-dark',
  fontSize: 14,
  code: '',
  isExecuting: false,
  result: null,

  setLanguage: (language) => set({ language }),
  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
  setCode: (code) => set({ code }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setResult: (result) => set({ result })
}));
