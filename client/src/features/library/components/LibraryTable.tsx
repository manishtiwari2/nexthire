import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Code2, Database } from 'lucide-react';
import {
  Button, DifficultyBadge, Skeleton, EmptyState,
  TableContainer, Table, THead, TBody, TR, TH, TD
} from '../../../shared/components/ui';
import { BookmarkButton } from './BookmarkButton';
import { SourceBadge, FrequencyBadge, StatusBadge, CompanyChips } from './MetadataBadges';
import type { QuestionCard } from '../types';

interface Props {
  questions: QuestionCard[];
  isLoading?: boolean;
  /** Query keys to refresh after bookmark/status changes. */
  invalidate?: unknown[][];
  emptyHint?: string;
}

/** Rich, metadata-aware question table used across the library, sheets, and practice views. */
export const LibraryTable: React.FC<Props> = ({ questions, isLoading, invalidate = [], emptyHint }) => (
  <TableContainer>
    <Table>
      <THead>
        <tr>
          <TH className="w-8"></TH>
          <TH>Problem</TH>
          <TH className="hidden md:table-cell">Topic</TH>
          <TH>Difficulty</TH>
          <TH className="hidden lg:table-cell">Frequency</TH>
          <TH className="hidden xl:table-cell">Source</TH>
          <TH>Status</TH>
          <TH className="text-right">Action</TH>
        </tr>
      </THead>
      <TBody>
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <TR key={i}>
              <TD><Skeleton className="h-5 w-5 rounded" /></TD>
              <TD><div className="space-y-2"><Skeleton className="h-4 w-56" /><Skeleton className="h-3 w-28" /></div></TD>
              <TD className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TD>
              <TD><Skeleton className="h-5 w-16 rounded-full" /></TD>
              <TD className="hidden lg:table-cell"><Skeleton className="h-5 w-16 rounded-full" /></TD>
              <TD className="hidden xl:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></TD>
              <TD><Skeleton className="h-5 w-16 rounded-full" /></TD>
              <TD className="text-right"><Skeleton className="ml-auto h-8 w-20 rounded-lg" /></TD>
            </TR>
          ))
        ) : questions.length === 0 ? (
          <tr>
            <td colSpan={8} className="p-0">
              <EmptyState
                className="rounded-none border-0 bg-transparent"
                icon={<Database />}
                title="No problems found"
                description={emptyHint || 'No problems match your current filters.'}
              />
            </td>
          </tr>
        ) : (
          questions.map((q) => (
            <TR key={q.id} interactive>
              <TD>
                <BookmarkButton questionId={q.id} bookmarked={q.progress?.isBookmarked} invalidate={invalidate} />
              </TD>
              <TD className="text-on-surface">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <Code2 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 space-y-1.5">
                    <Link to={`/questions/${q.id}`} className="font-semibold text-on-surface hover:text-primary">
                      {q.title}
                    </Link>
                    <CompanyChips companies={q.companies} />
                  </div>
                </div>
              </TD>
              <TD className="hidden md:table-cell font-medium">{q.topic?.name || '—'}</TD>
              <TD><DifficultyBadge difficulty={q.difficulty} /></TD>
              <TD className="hidden lg:table-cell"><FrequencyBadge band={q.frequencyBand} /></TD>
              <TD className="hidden xl:table-cell"><SourceBadge platform={q.sourcePlatform} url={q.sourceUrl} /></TD>
              <TD><StatusBadge status={q.progress?.status} /></TD>
              <TD className="text-right">
                {q.isExternalOnly && q.sourceUrl ? (
                  <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" rightIcon={<ExternalLink className="h-3.5 w-3.5" />}>Open</Button>
                  </a>
                ) : (
                  <Link to={`/questions/${q.id}`}>
                    <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>Solve</Button>
                  </Link>
                )}
              </TD>
            </TR>
          ))
        )}
      </TBody>
    </Table>
  </TableContainer>
);
