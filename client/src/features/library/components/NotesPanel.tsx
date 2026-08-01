import React, { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Lock, Save, Check } from 'lucide-react';
import { Textarea, Input, Button, Spinner } from '../../../shared/components/ui';
import { fetchNote, saveNote } from '../api';
import type { NoteDto } from '../types';

const FIELDS: Array<{ key: keyof NoteDto; label: string; multiline: boolean; placeholder: string }> = [
  { key: 'approach', label: 'Approach', multiline: true, placeholder: 'How do you solve it? Core idea, data structures…' },
  { key: 'keyInsights', label: 'Key insights', multiline: true, placeholder: 'The trick / observation that unlocks it.' },
  { key: 'mistakes', label: 'Mistakes made', multiline: true, placeholder: 'Where you went wrong, off-by-ones, wrong assumptions…' },
  { key: 'edgeCases', label: 'Edge cases', multiline: true, placeholder: 'Empty input, duplicates, overflow, single element…' },
  { key: 'timeComplexity', label: 'Time complexity', multiline: false, placeholder: 'e.g. O(n log n)' },
  { key: 'spaceComplexity', label: 'Space complexity', multiline: false, placeholder: 'e.g. O(n)' },
  { key: 'revisionNotes', label: 'Revision notes', multiline: true, placeholder: 'What to remember next time you revise this.' }
];

const EMPTY: NoteDto = { questionId: '' };

/** Private, per-user preparation notes for a question. */
export const NotesPanel: React.FC<{ questionId: string }> = ({ questionId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['note', questionId],
    queryFn: () => fetchNote(questionId),
    enabled: !!questionId
  });

  const [form, setForm] = useState<NoteDto>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data, questionId });
  }, [data, questionId]);

  const mutation = useMutation({
    mutationFn: () => saveNote(questionId, form),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1800); }
  });

  const update = (key: keyof NoteDto, value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (isLoading) {
    return <div className="flex justify-center py-10"><Spinner label="Loading notes…" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
        <Lock className="h-3.5 w-3.5 text-primary" />
        These notes are private to you.
      </div>

      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{f.label}</label>
          {f.multiline ? (
            <Textarea
              rows={3}
              value={(form[f.key] as string) || ''}
              placeholder={f.placeholder}
              onChange={(e) => update(f.key, e.target.value)}
            />
          ) : (
            <Input
              value={(form[f.key] as string) || ''}
              placeholder={f.placeholder}
              onChange={(e) => update(f.key, e.target.value)}
            />
          )}
        </div>
      ))}

      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        leftIcon={saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        className="w-full"
      >
        {saved ? 'Saved' : mutation.isPending ? 'Saving…' : 'Save notes'}
      </Button>
    </div>
  );
};
