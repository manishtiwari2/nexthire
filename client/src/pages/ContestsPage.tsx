import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { AppHeader } from '../components/layout/AppHeader';
import { AppSidebar } from '../components/layout/AppSidebar';
import { ContestCard } from '../features/contest/components/ContestCard';
import { Trophy, Plus } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from '../shared/components/ui/Button';

export const ContestsPage: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['contests'],
    queryFn: () => apiClient.get('/contests')
  });

  const contests = data?.data || [];

  return (
    <div className="min-h-screen bg-surface">
      <AppSidebar />
      <AppHeader />

      <main className="ml-[260px] pt-16 p-8 space-y-8 max-w-container-max mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
              <Trophy className="w-6 h-6 text-primary" /> Speed Coding Contests
            </h1>
            <p className="text-sm text-on-surface-variant">Compete in real-time speed coding sprints backed by live Socket.IO leaderboards.</p>
          </div>

          {isAdmin && (
            <Link to="/admin/contests/create">
              <Button variant="primary" className="bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4" /> Create Contest (Admin)
              </Button>
            </Link>
          )}
        </div>

        {/* Contests Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading ? (
            <p className="text-xs text-slate-500">Loading contests...</p>
          ) : isError ? (
            <p className="text-xs text-red-500">Failed to load contests.</p>
          ) : contests.length === 0 ? (
            <p className="text-xs text-slate-500">No active or scheduled contests found.</p>
          ) : (
            contests.map((c: any) => (
              <ContestCard key={c.id} contest={c} />
            ))
          )}
        </div>
      </main>
    </div>
  );
};
