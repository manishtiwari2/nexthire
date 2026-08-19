import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { QuestionFilterBar } from '../features/question-bank/components/QuestionFilterBar';
import { QuestionTable } from '../features/question-bank/components/QuestionTable';
import { Database, Plus } from 'lucide-react';
import { Button, SectionHeader } from '../shared/components/ui';

export const QuestionBankPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topicId, setTopicId] = useState('');
  // Default to problems the judge can actually run. The library is mostly external references,
  // so an unfiltered first page is almost entirely problems that open somewhere else.
  const [solvable, setSolvable] = useState('true');
  const [page, setPage] = useState(1);

  const { user } = useAuthStore();
  const { addToast } = useNotificationStore();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const { data: topicsData } = useQuery({
    queryKey: ['topics'],
    queryFn: () => apiClient.get('/questions/topics')
  });

  const { data, isLoading } = useQuery({
    queryKey: ['questions', search, difficulty, topicId, solvable, page],
    queryFn: () =>
      apiClient.get('/questions', {
        params: { search, difficulty, topicId, solvable: solvable || undefined, page, limit: 10 },
      })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/questions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      addToast('Question Deleted', 'The question was removed from the bank.', 'success');
    },
    onError: (err: any) => {
      addToast('Delete Failed', typeof err === 'string' ? err : 'Could not delete the question.', 'error');
    }
  });

  // apiClient's response interceptor unwraps to the API envelope { success, data, pagination },
  // so `data` here is the body, not an AxiosResponse.
  const questions = (data as any)?.data || [];
  const pagination = (data as any)?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 };
  const topics = (topicsData as any)?.data || [];

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Database />}
        title="Question Bank"
        description="Practice top interview DSA questions categorized by topics and difficulty."
        actions={
          isAdmin && (
            <Link to="/admin/questions/create">
              <Button
                variant="primary"
                leftIcon={<Plus className="h-4 w-4" />}
                className="bg-tertiary text-white hover:bg-tertiary/90"
              >
                Add Question (Admin)
              </Button>
            </Link>
          )
        }
      />

      {/* Filter Bar */}
      <QuestionFilterBar
        search={search}
        onSearchChange={(val) => { setSearch(val); setPage(1); }}
        difficulty={difficulty}
        onDifficultyChange={(val) => { setDifficulty(val); setPage(1); }}
        topicId={topicId}
        onTopicChange={(val) => { setTopicId(val); setPage(1); }}
        topics={topics}
        solvable={solvable}
        onSolvableChange={(val) => { setSolvable(val); setPage(1); }}
        page={page}
        totalPages={pagination.totalPages}
        onPageChange={(p) => setPage(p)}
      />

      {/* Question Table */}
      <QuestionTable
        questions={questions}
        isLoading={isLoading}
        isAdmin={isAdmin}
        onDeleteQuestion={(id) => deleteMutation.mutate(id)}
      />
    </div>
  );
};
