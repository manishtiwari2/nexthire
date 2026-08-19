import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Library, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input, Select, Button, Card, SectionHeader } from '../shared/components/ui';
import { LibraryTable } from '../features/library/components/LibraryTable';
import { SOURCE_LABELS } from '../features/library/components/MetadataBadges';
import { fetchLibrary, fetchTopics, fetchCompanies } from '../features/library/api';
import { useAuthStore } from '../store/useAuthStore';
import type { SourcePlatform } from '../features/library/types';

const SORTS = [
  { value: '', label: 'Newest' },
  { value: 'frequency', label: 'Most frequent' },
  { value: 'acceptance', label: 'Acceptance rate' },
  { value: 'estimatedTime', label: 'Quickest' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'title', label: 'Title (A–Z)' }
];

export const LibraryPage: React.FC = () => {
  const { user } = useAuthStore();
  const [filters, setFilters] = useState({
    search: '', difficulty: '', topicSlug: '', companySlug: '', source: '',
    frequency: '', status: '', bookmarked: '', sort: ''
  });
  const [page, setPage] = useState(1);

  const set = (key: string, value: string) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  const { data: topics = [] } = useQuery({ queryKey: ['col-topics'], queryFn: fetchTopics });
  const { data: companies = [] } = useQuery({ queryKey: ['col-companies'], queryFn: fetchCompanies });

  const queryKey = ['library', filters, page];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchLibrary({
      ...filters,
      bookmarked: filters.bookmarked || undefined,
      page,
      limit: 15
    })
  });

  const questions = data?.questions || [];
  const pagination = data?.pagination || { total: 0, page: 1, limit: 15, totalPages: 1 };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Library />}
        title="Question Library"
        description="The central knowledge base — browse, filter, and track every problem by topic, company, source, and difficulty."
      />

      <Card className="space-y-3 p-4">
        {/* Row 1: search + sort */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            icon={<Search />}
            placeholder="Search problems…"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            containerClassName="flex-1"
            aria-label="Search problems"
          />
          <Select value={filters.sort} onChange={(e) => set('sort', e.target.value)} containerClassName="sm:w-48" aria-label="Sort">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>

        {/* Row 2: facet filters */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Select value={filters.difficulty} onChange={(e) => set('difficulty', e.target.value)} aria-label="Difficulty">
            <option value="">All levels</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </Select>
          <Select value={filters.topicSlug} onChange={(e) => set('topicSlug', e.target.value)} aria-label="Topic">
            <option value="">All topics</option>
            {topics.map((t) => <option key={t.id} value={t.slug}>{t.name} ({t.total})</option>)}
          </Select>
          <Select value={filters.companySlug} onChange={(e) => set('companySlug', e.target.value)} aria-label="Company">
            <option value="">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.slug}>{c.name} ({c.total})</option>)}
          </Select>
          <Select value={filters.source} onChange={(e) => set('source', e.target.value)} aria-label="Source">
            <option value="">All sources</option>
            {(Object.keys(SOURCE_LABELS) as SourcePlatform[]).map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
          </Select>
          <Select value={filters.frequency} onChange={(e) => set('frequency', e.target.value)} aria-label="Frequency">
            <option value="">Any frequency</option>
            <option value="VERY_HIGH">Very high</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
          <Select
            value={filters.bookmarked === 'true' ? 'bookmarked' : filters.status}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'bookmarked') { set('bookmarked', 'true'); setFilters((f) => ({ ...f, status: '' })); }
              else { set('status', v); setFilters((f) => ({ ...f, bookmarked: '' })); }
            }}
            aria-label="My progress"
            disabled={!user}
          >
            <option value="">{user ? 'All progress' : 'Sign in to track'}</option>
            <option value="solved">Solved</option>
            <option value="unsolved">Unsolved</option>
            <option value="attempted">Attempted</option>
            <option value="bookmarked">Bookmarked</option>
          </Select>
        </div>
      </Card>

      <LibraryTable questions={questions} isLoading={isLoading} invalidate={[['library']]} />

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-muted">
          {pagination.total} problem{pagination.total === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-on-surface-variant">
            Page <span className="text-on-surface">{page}</span> of {pagination.totalPages || 1}
          </span>
          <Button variant="outline" size="icon" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
