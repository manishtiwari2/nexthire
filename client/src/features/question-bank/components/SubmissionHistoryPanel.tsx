import React from 'react';
import { Clock, Cpu, CheckCircle2, AlertCircle, Code2 } from 'lucide-react';

interface SubmissionHistoryPanelProps {
  submissions: any[];
  isLoading: boolean;
  isError?: boolean;
  onSelectSubmission?: (code: string, lang: string) => void;
}

export const SubmissionHistoryPanel: React.FC<SubmissionHistoryPanelProps> = ({
  submissions,
  isLoading,
  isError,
  onSelectSubmission
}) => {
  if (isLoading) {
    return <p className="text-xs text-slate-500 py-4">Loading submission history...</p>;
  }

  if (isError) {
    return <p className="text-xs text-red-500 py-4">Failed to load submission history.</p>;
  }

  if (!submissions || submissions.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-xs space-y-1">
        <Code2 className="w-8 h-8 mx-auto text-slate-400" />
        <p className="font-bold">No Submissions Yet</p>
        <p className="text-[11px] text-slate-400">Write your solution in the editor and click Run Code or Submit.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <h3 className="font-bold text-sm text-slate-800">Your Submission History</h3>

      <div className="space-y-2">
        {submissions.map((sub: any) => {
          const isAccepted = sub.status === 'ACCEPTED';
          const exec = sub.executions && sub.executions[0];

          return (
            <div
              key={sub.id}
              className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isAccepted ? (
                    <span className="flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-100 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> ACCEPTED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-700 font-bold text-xs bg-red-100 px-2 py-0.5 rounded-full">
                      <AlertCircle className="w-3.5 h-3.5" /> {sub.status}
                    </span>
                  )}
                  <span className="font-mono text-[11px] font-bold text-slate-700">{sub.language}</span>
                </div>

                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(sub.createdAt).toLocaleString()}
                </span>
              </div>

              {exec && (
                <div className="flex items-center gap-4 text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-200/60">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-primary" /> {exec.executionTime || 12}ms</span>
                  <span className="flex items-center gap-1"><Cpu className="w-3 h-3 text-primary" /> {exec.memoryUsed || 8.4}MB</span>
                  <span>Passed {exec.passCount}/{exec.totalTestCases} Tests</span>
                </div>
              )}

              {onSelectSubmission && (
                <button
                  onClick={() => onSelectSubmission(sub.code, sub.language)}
                  className="text-[11px] font-bold text-primary hover:underline pt-1 inline-block"
                >
                  Load Code into Editor &rarr;
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
