import React from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input, Select, Button, Card } from '../../../shared/components/ui';

interface QuestionFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  difficulty: string;
  onDifficultyChange: (value: string) => void;
  topicId: string;
  onTopicChange: (value: string) => void;
  topics: Array<{ id: string; name: string }>;
  /** '' = everything, 'true' = solvable here, 'false' = external references only. */
  solvable: string;
  onSolvableChange: (value: string) => void;
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
  solvable,
  onSolvableChange,
  page,
  totalPages,
  onPageChange,
}) => {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <Input
            icon={<Search />}
            placeholder="Search problems by title or topic…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            containerClassName="flex-1"
            aria-label="Search questions"
          />
          <Select
            value={difficulty}
            onChange={(e) => onDifficultyChange(e.target.value)}
            aria-label="Filter by difficulty"
            containerClassName="sm:w-44"
          >
            <option value="">All Difficulties</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </Select>
          <Select
            value={solvable}
            onChange={(e) => onSolvableChange(e.target.value)}
            aria-label="Filter by whether the problem can be solved here"
            containerClassName="sm:w-52"
          >
            {/* Most of the library is reference links to other platforms; only a subset has a
                local statement and test cases the judge can run. */}
            <option value="">All problems</option>
            <option value="true">Solvable here</option>
            <option value="false">Reference links</option>
          </Select>
          <Select
            value={topicId}
            onChange={(e) => onTopicChange(e.target.value)}
            aria-label="Filter by topic"
            containerClassName="sm:w-44"
          >
            <option value="">All Topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs font-medium text-on-surface-variant">
            Page <span className="text-on-surface">{page}</span> of {totalPages || 1}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
