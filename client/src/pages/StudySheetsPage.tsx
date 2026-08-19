import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus, X } from 'lucide-react';
import { SectionHeader, Button, Input, Textarea, Card, Skeleton, EmptyState } from '../shared/components/ui';
import { SheetCard } from '../features/library/components/SheetCard';
import { fetchSheets, createSheet } from '../features/library/api';
import { useNotificationStore } from '../store/useNotificationStore';

const CreateSheetModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const qc = useQueryClient();
  const { addToast } = useNotificationStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: () => createSheet({ name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sheets'] });
      addToast('Sheet created', 'Your custom study sheet is ready. Add problems from the library.', 'success');
      onClose();
    },
    onError: (err: any) => addToast('Could not create sheet', typeof err === 'string' ? err : 'Please try again.', 'error')
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-on-surface">New study sheet</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My FAANG sprint" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Description</label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this sheet for?" />
          </div>
          <Button className="w-full" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Creating…' : 'Create sheet'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export const StudySheetsPage: React.FC = () => {
  const [showCreate, setShowCreate] = useState(false);
  const { data: sheets = [], isLoading } = useQuery({ queryKey: ['sheets'], queryFn: fetchSheets });

  const system = sheets.filter((s) => s.kind === 'SYSTEM');
  const custom = sheets.filter((s) => s.kind === 'CUSTOM');

  return (
    <>
      <div className="space-y-6">
        <SectionHeader
          icon={<ListChecks />}
          title="Study Sheets"
          description="Curated interview lists and your own custom sheets — each references library problems and tracks your progress."
          actions={
            <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
              New sheet
            </Button>
          }
        />

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant">Curated</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {system.map((s) => <SheetCard key={s.id} sheet={s} />)}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant">Your sheets</h2>
              {custom.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {custom.map((s) => <SheetCard key={s.id} sheet={s} />)}
                </div>
              ) : (
                <EmptyState
                  icon={<Plus />}
                  title="No custom sheets yet"
                  description="Create a sheet to curate your own problem list for a target company or weak area."
                />
              )}
            </div>
          </>
        )}
      </div>

      {showCreate && <CreateSheetModal onClose={() => setShowCreate(false)} />}
    </>
  );
};
