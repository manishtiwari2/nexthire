import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { AppHeader } from '../components/layout/AppHeader';
import { AppSidebar } from '../components/layout/AppSidebar';
import { useAuthStore } from '../store/useAuthStore';
import { QuestionFilterBar } from '../features/question-bank/components/QuestionFilterBar';
import { QuestionTable } from '../features/question-bank/components/QuestionTable';
import { Database, Plus } from 'lucide-react';
import { Button } from '../shared/components/ui/Button';

export const QuestionBankPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topicId, setTopicId] = useState('');
  const [page, setPage] = useState(1);

  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const { data: topicsData } = useQuery({
    queryKey: ['topics'],
    queryFn: () => apiClient.get('/questions/topics')
  });

  const { data, isLoading } = useQuery({
    queryKey: ['questions', search, difficulty, topicId, page],
    queryFn: () => apiClient.get('/questions', { params: { search, difficulty, topicId, page, limit: 10 } })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/questions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    }
  });

  const questions = data?.data || [];
  const pagination = data?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 };
  const topics = topicsData?.data || [];

  return (
    <div className="min-h-screen bg-surface">
      <AppSidebar />
      <AppHeader />

      <main className="ml-[260px] pt-16 p-8 space-y-8 max-w-container-max mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
              <Database className="w-6 h-6 text-primary" /> Question Bank
            </h1>
            <p className="text-sm text-on-surface-variant">Practice top interview DSA questions categorized by topics and difficulty.</p>
          </div>

          {isAdmin && (
            <Button variant="primary" className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4" /> Add Question (Admin)
            </Button>
          )}
        </div>

        {/* Filter Bar */}
        <QuestionFilterBar
          search={search}
          onSearchChange={(val) => { setSearch(val); setPage(1); }}
          difficulty={difficulty}
          onDifficultyChange={(val) => { setDifficulty(val); setPage(1); }}
          topicId={topicId}
          onTopicChange={(val) => { setTopicId(val); setPage(1); }}
          topics={topics}
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
      </main>
    </div>
  );
};
