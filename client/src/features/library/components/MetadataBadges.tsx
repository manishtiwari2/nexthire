import React from 'react';
import { ExternalLink, Flame, Clock, CheckCircle2, CircleDashed, Circle } from 'lucide-react';
import { Badge } from '../../../shared/components/ui';
import type { FrequencyBand, ProgressStatus, SourcePlatform } from '../types';

export const SOURCE_LABELS: Record<SourcePlatform, string> = {
  LEETCODE: 'LeetCode',
  GEEKSFORGEEKS: 'GeeksforGeeks',
  HACKERRANK: 'HackerRank',
  CODEFORCES: 'Codeforces',
  CODECHEF: 'CodeChef',
  ATCODER: 'AtCoder',
  INTERVIEWBIT: 'InterviewBit',
  CUSTOM: 'Original'
};

const FREQ: Record<FrequencyBand, { label: string; variant: 'default' | 'info' | 'warning' | 'danger' }> = {
  LOW: { label: 'Low', variant: 'default' },
  MEDIUM: { label: 'Medium', variant: 'info' },
  HIGH: { label: 'High', variant: 'warning' },
  VERY_HIGH: { label: 'Very High', variant: 'danger' }
};

export const SourceBadge: React.FC<{ platform?: SourcePlatform; url?: string | null }> = ({ platform, url }) => {
  if (!platform) return null;
  const label = SOURCE_LABELS[platform] || platform;
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded-full border border-outline bg-transparent px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
      >
        {label} <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return <Badge variant="outline">{label}</Badge>;
};

export const FrequencyBadge: React.FC<{ band?: FrequencyBand | null }> = ({ band }) => {
  if (!band) return null;
  const f = FREQ[band];
  return <Badge variant={f.variant}><Flame className="h-3 w-3" /> {f.label}</Badge>;
};

export const EstTime: React.FC<{ minutes?: number | null }> = ({ minutes }) => {
  if (!minutes) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-on-surface-muted">
      <Clock className="h-3 w-3" /> {minutes}m
    </span>
  );
};

const STATUS_CFG: Record<ProgressStatus, { label: string; variant: 'success' | 'warning' | 'default'; icon: React.ReactNode }> = {
  SOLVED: { label: 'Solved', variant: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
  ATTEMPTED: { label: 'Attempted', variant: 'warning', icon: <CircleDashed className="h-3 w-3" /> },
  TODO: { label: 'To do', variant: 'default', icon: <Circle className="h-3 w-3" /> }
};

export const StatusBadge: React.FC<{ status?: ProgressStatus }> = ({ status = 'TODO' }) => {
  const c = STATUS_CFG[status];
  return <Badge variant={c.variant}>{c.icon} {c.label}</Badge>;
};

export const CompanyChips: React.FC<{ companies?: string[]; max?: number }> = ({ companies = [], max = 3 }) => {
  if (!companies.length) return null;
  const shown = companies.slice(0, max);
  const extra = companies.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((c) => (
        <Badge key={c} variant="accent" className="px-1.5 py-0 text-[10px]">{c}</Badge>
      ))}
      {extra > 0 && <Badge variant="default" className="px-1.5 py-0 text-[10px]">+{extra}</Badge>}
    </div>
  );
};
