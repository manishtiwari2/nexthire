import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ListChecks, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/layout/AppLayout';
import { SectionHeader, Spinner, EmptyState, Button, Badge } from '../shared/components/ui';
import { LibraryTable } from '../features/library/components/LibraryTable';
import { SheetProgressBar } from '../features/library/components/SheetCard';
import { fetchSheet, deleteSheet } from '../features/library/api';
import { useNotificationStore } from '../store/useNotificationStore';
import { useNavigate } from 'react-router-dom';
import type { QuestionCard, SheetItem } from '../features/library/types';

export const StudySheetDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { addToast } = useNotificationStore();

  const { data: sheet, isLoading } = useQuery({
    queryKey: ['sheet', slug],
    queryFn: () => fetchSheet(slug!),
    enabled: !!slug
  });

  const del = useMutation({
    mutationFn: () => deleteSheet(sheet!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sheets'] }); addToast('Sheet deleted', '', 'success'); navigate('/sheets'); }
  });

  // Group ordered items by their section label, preserving order.
  const groups: Array<{ section: string; questions: QuestionCard[] }> = [];
  if (sheet) {
    const map = new Map<string, QuestionCard[]>();
    (sheet.items || []).forEach((it: SheetItem) => {
      const key = it.section || 'Problems';
      if (!map.has(key)) { map.set(key, []); groups.push({ section: key, questions: map.get(key)! }); }
      map.get(key)!.push({ ...it.question, progress: it.progress });
    });
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <Link to="/sheets" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
          <ArrowLeft className="h-4 w-4" /> All sheets
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner label="Loading sheet…" /></div>
        ) : !sheet ? (
          <EmptyState icon={<ListChecks />} title="Sheet not found" description="This sheet may have been removed or is private." />
        ) : (
          <>
            <SectionHeader
              icon={<ListChecks />}
              title={sheet.name}
              description={sheet.description || undefined}
              actions={
                <div className="flex items-center gap-2">
                  <Badge variant={sheet.kind === 'SYSTEM' ? 'primary' : 'accent'}>{sheet.kind === 'SYSTEM' ? 'Curated' : 'Custom'}</Badge>
                  {sheet.canEdit && sheet.kind === 'CUSTOM' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete sheet"
                      className="text-on-surface-muted hover:bg-error-container hover:text-danger"
                      onClick={() => { if (window.confirm('Delete this sheet?')) del.mutate(); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              }
            />

            <div className="max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elev-1">
              <SheetProgressBar solved={sheet.solvedCount} total={sheet.total} />
            </div>

            {groups.length === 0 ? (
              <EmptyState icon={<ListChecks />} title="No problems in this sheet yet" description="Add problems from the Question Library." />
            ) : (
              groups.map((g) => (
                <div key={g.section} className="space-y-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                    {g.section}
                    <span className="text-xs font-normal text-on-surface-muted">
                      {g.questions.filter((q) => q.progress?.status === 'SOLVED').length}/{g.questions.length}
                    </span>
                  </h2>
                  <LibraryTable questions={g.questions} invalidate={[['sheet', slug]]} />
                </div>
              ))
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};
