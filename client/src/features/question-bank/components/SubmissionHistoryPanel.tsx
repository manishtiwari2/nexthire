import React from 'react';
import { Clock, Cpu, CheckCircle2, AlertCircle, Code2, ArrowRight } from 'lucide-react';
import { Badge, Spinner, EmptyState } from '../../../shared/components/ui';

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
  onSelectSubmission,
}) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="Loading submission history…" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<AlertCircle />}
        title="Couldn't load history"
        description="Failed to load your submission history. Please try again."
      />
    );
  }

  if (!submissions || submissions.length === 0) {
    return (
      <EmptyState
        icon={<Code2 />}
        title="No submissions yet"
        description="Write your solution in the editor and click Run Code or Submit to see results here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {submissions.map((sub: any) => {
        const isAccepted = sub.status === 'ACCEPTED';
        // Every submission endpoint now returns the hidden-test-safe DTO, which carries a
        // single `execution` object. (The contest history endpoint always did — this panel
        // only understood the raw `executions[]` shape, so contest rows showed no metrics.)
        const exec = sub.execution;

        return (
          <div
            key={sub.id}
            className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low p-4 transition-colors hover:border-outline"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={isAccepted ? 'success' : 'danger'}>
                  {isAccepted ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {isAccepted ? 'ACCEPTED' : sub.status}
                </Badge>
                <span className="font-mono text-[11px] font-semibold text-on-surface-variant">{sub.language}</span>
              </div>
              <span className="font-mono text-[10px] text-on-surface-muted">
                {new Date(sub.createdAt).toLocaleString()}
              </span>
            </div>

            {exec && (
              <div className="flex flex-wrap items-center gap-4 border-t border-outline-variant pt-2.5 font-mono text-[11px] text-on-surface-muted">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-primary" /> {exec.executionTime != null ? `${exec.executionTime}ms` : '—'}
                </span>
                <span className="flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-tertiary" /> {exec.memoryUsed != null ? `${exec.memoryUsed}MB` : '—'}
                </span>
                <span>Passed {exec.passedTests ?? 0}/{exec.totalTests ?? 0}</span>
              </div>
            )}

            {onSelectSubmission && (
              <button
                onClick={() => onSelectSubmission(sub.code, sub.language)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary transition-colors hover:text-primary-hover"
              >
                Load code into editor <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
