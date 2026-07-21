import React from 'react';
import { Search, Filter } from 'lucide-react';
import { Input } from '../../../shared/components/ui/Input';

interface QuestionFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  difficulty: string;
  onDifficultyChange: (value: string) => void;
  topicId: string;
  onTopicChange: (value: string) => void;
  topics: Array<{ id: string; name: string }>;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
}

export const QuestionFilterBar: React.FC<QuestionFilterBarProps> = ({
  search,
  onSearchChange,
  difficulty,
  onDifficultyChange,
  topicId,
  onTopicChange,
  topics,
  page,
  totalPages,
  onPageChange
}) => {
  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-outline-variant shadow-sm">
      <div className="flex flex-1 items-center gap-3 w-full">
        <div className="flex-1">
          <Input
            icon={<Search className="w-4 h-4" />}
            placeholder="Search problems by title, topic, or description..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <select
          value={difficulty}
          onChange={(e) => onDifficultyChange(e.target.value)}
          className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-xs font-medium outline-none cursor-pointer focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All Difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>

        <select
          value={topicId}
          onChange={(e) => onTopicChange(e.target.value)}
          className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-xs font-medium outline-none cursor-pointer focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All Topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Pagination Bar */}
      <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
        <span>Page {page} of {totalPages || 1}</span>
        <div className="flex gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
          >
            &larr; Prev
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
