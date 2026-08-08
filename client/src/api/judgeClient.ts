// Judge client — a single authenticated Socket.IO connection plus a helper that resolves a
// submission's verdict. Socket-first: when the socket is connected we wait for the worker's
// `submission:update` events and only fall back to polling if the socket is unavailable.

import { io, Socket } from 'socket.io-client';
import { apiClient } from './client';
import { getAccessToken, onAccessTokenChange } from './tokenStore';
import type { ExecutionResult, JudgePhase } from '../store/useEditorStore';

let socket: Socket | null = null;

/** Lazily create the shared authenticated socket (joins the user's room server-side). */
export function getJudgeSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      // Read at connect time from the in-memory token store, and refreshed below — the
      // server rejects the handshake for a stale token, so a rotated token must be
      // reflected here or the socket silently stops reconnecting.
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling']
    });

    onAccessTokenChange((token) => {
      if (!socket) return;
      if (!token) {
        // Signed out: drop the connection rather than letting the server reject it.
        socket.disconnect();
        return;
      }
      if (!socket.connected) socket.connect();
    });
  }
  return socket;
}

/** Tear the socket down on sign-out so the next user gets a fresh, correctly-authed one. */
export function resetJudgeSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

interface ResultDto {
  status: string;
  pending?: boolean;
  executionTime?: number;
  memoryUsed?: number;
  passedTests?: number;
  totalTests?: number;
  compilerOutput?: string;
  runtimeOutput?: string;
  stderr?: string;
  exitCode?: number | null;
  testResults?: ExecutionResult['testResults'];
}

const TERMINAL = new Set([
  'ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED',
  'OUTPUT_LIMIT_EXCEEDED', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'INTERNAL_ERROR', 'CANCELLED'
]);

function mapResult(dto: ResultDto): ExecutionResult {
  const primary = dto.runtimeOutput || dto.compilerOutput || dto.stderr || 'Execution complete.';
  return {
    status: dto.status,
    output: primary,
    compilerOutput: dto.compilerOutput,
    stderr: dto.stderr,
    exitCode: dto.exitCode ?? null,
    executionTime: dto.executionTime,
    memoryUsed: dto.memoryUsed,
    passCount: dto.passedTests,
    totalTestCases: dto.totalTests,
    testResults: dto.testResults
  };
}

/**
 * Wait for a submission's final verdict.
 * @param submissionId the submission to watch
 * @param onPhase called as the judge progresses (RUNNING, etc.)
 */
export function awaitVerdict(
  submissionId: string,
  onPhase?: (phase: JudgePhase) => void
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout>;
    const s = getJudgeSocket();

    const cleanup = () => {
      s.off('submission:update', onEvent);
      clearTimeout(pollTimer);
    };
    const done = (r: ExecutionResult) => { if (!settled) { settled = true; cleanup(); resolve(r); } };
    const fail = (e: Error) => { if (!settled) { settled = true; cleanup(); reject(e); } };

    const fetchFinal = async (fallbackStatus?: string) => {
      try {
        const res: any = await apiClient.get(`/submissions/${submissionId}/result`);
        if (res.data && !res.data.pending) return done(mapResult(res.data));
        if (fallbackStatus) return done(mapResult({ status: fallbackStatus }));
      } catch {
        if (fallbackStatus) return done(mapResult({ status: fallbackStatus }));
      }
    };

    // ---- Socket path ----
    const onEvent = (payload: any) => {
      if (!payload || payload.submissionId !== submissionId) return;
      if (payload.phase === 'RUNNING') onPhase?.('RUNNING');
      if (payload.phase === 'COMPLETED') fetchFinal(payload.status);
    };
    s.on('submission:update', onEvent);

    // ---- Polling fallback ----
    // If the socket is connected we only poll as a late safety net; otherwise we poll actively.
    let attempts = 0;
    const poll = async () => {
      if (settled) return;
      attempts++;
      try {
        const res: any = await apiClient.get(`/submissions/${submissionId}/result`);
        const dto: ResultDto = res.data;
        if (dto && !dto.pending && TERMINAL.has(dto.status)) return done(mapResult(dto));
        if (dto?.status === 'RUNNING') onPhase?.('RUNNING');
      } catch { /* transient — keep trying */ }
      if (attempts >= 60) return fail(new Error('Timed out waiting for judge result'));
      pollTimer = setTimeout(poll, 800);
    };
    // Connected → first safety poll after 6s; disconnected → poll promptly.
    pollTimer = setTimeout(poll, s.connected ? 6000 : 800);
  });
}
