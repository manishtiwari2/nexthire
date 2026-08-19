import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ContestCard } from '../features/contest/components/ContestCard';
import { Trophy, Plus, Key, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import {
  Button,
  Input,
  Card,
  Badge,
  SectionHeader,
  SkeletonCard,
  EmptyState,
} from '../shared/components/ui';

export const ContestsPage: React.FC = () => {
  const [joinCode, setJoinCode] = useState('');
  const { user } = useAuthStore();
  const { addToast } = useNotificationStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['contests'],
    queryFn: () => apiClient.get('/contests'),
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) => apiClient.post('/contests/join-by-code', { code }),
    onSuccess: (res: any) => {
      const contestId = res.data?.contestId || res.data?.contest?.id;
      addToast('Assessment Joined', 'Successfully registered for assessment session', 'success');
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      if (contestId) navigate(`/contest/${contestId}`);
    },
    onError: (err: any) => {
      // The API client rejects with the server's error string (not an Error object).
      addToast('Join Failed', typeof err === 'string' ? err : 'Invalid or expired assessment join code', 'error');
    },
  });

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    joinMutation.mutate(joinCode.trim());
  };

  const contests = data?.data || [];

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Trophy />}
        title="DSA Assessments"
        description="Host timed coding contests, join via unique codes, and track real-time leaderboards."
        actions={
          <Link to="/admin/contests/create">
            <Button leftIcon={<Plus className="h-4 w-4" />}>New Assessment</Button>
          </Link>
        }
      />

      {/* Join by code */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-md space-y-2">
            <Badge variant="primary" className="uppercase tracking-wide">
              <Key className="h-3 w-3" /> Quick Join
            </Badge>
            <h3 className="text-lg font-semibold text-on-surface">Have a private join code?</h3>
            <p className="text-sm text-on-surface-variant">
              Enter the assessment code from your host to jump straight into the live interview IDE.
            </p>
          </div>
          <form onSubmit={handleJoinByCode} className="flex w-full items-end gap-2 md:w-auto">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="DSA-X9Y2"
              aria-label="Assessment join code"
              required
              className="w-full font-mono font-semibold uppercase tracking-wider sm:w-44"
              containerClassName="flex-1 md:flex-none"
            />
            <Button
              type="submit"
              isLoading={joinMutation.isPending}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Join
            </Button>
          </form>
        </div>
      </Card>

      {/* Contest grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<Trophy />}
          title="Couldn't load assessments"
          description="Something went wrong fetching your sessions. Please refresh and try again."
        />
      ) : contests.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title="No active assessments"
          description="Create a new assessment to host a live coding session, or join one with a code above."
          action={
            isAdmin && (
              <Link to="/admin/contests/create">
                <Button leftIcon={<Plus className="h-4 w-4" />}>Create Assessment</Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {contests.map((c: any) => (
            <ContestCard key={c.id} contest={c} />
          ))}
        </div>
      )}
    </div>
  );
};
