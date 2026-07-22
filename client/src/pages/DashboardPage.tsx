import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { AppHeader } from '../components/layout/AppHeader';
import { AppSidebar } from '../components/layout/AppSidebar';
import { Trophy, Calendar, Flame, Code2, ArrowRight, TrendingUp, CheckCircle, Clock, Sparkles } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { data: profileData, isLoading: isProfileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiClient.get('/users/profile')
  });

  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiClient.get('/dashboard/stats')
  });

  const { data: contestsData } = useQuery({
    queryKey: ['contests'],
    queryFn: () => apiClient.get('/contests')
  });

  const { data: interviewsData } = useQuery({
    queryKey: ['interviews'],
    queryFn: () => apiClient.get('/interviews')
  });

  const profile = profileData?.data;
  const stats = statsData?.data;
  const contests = contestsData?.data || [];
  const interviews = interviewsData?.data || [];

  return (
    <div className="min-h-screen bg-surface">
      <AppSidebar />
      <AppHeader />

      <main className="ml-[260px] pt-16 p-8 space-y-8 max-w-container-max mx-auto">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden bg-gradient-to-r from-primary-container to-secondary text-white rounded-3xl p-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" /> NextHire v2.0 Live Platform
            </div>
            <h1 className="text-3xl font-black">Welcome Back, {profile?.user?.name || 'Alex Rivera'}!</h1>
            <p className="text-sm opacity-90 max-w-xl">
              Keep up the great work! Practice binary search or join your scheduled mock interview to continue advancing your skills.
            </p>
          </div>

          <div className="flex gap-3 z-10">
            <Link to="/questions" className="px-6 py-3 bg-white text-primary font-bold rounded-xl shadow-md hover:bg-slate-50 transition-all">
              Practice Questions
            </Link>
            <Link to="/contests" className="px-6 py-3 bg-white/10 backdrop-blur-md border border-white/30 text-white font-bold rounded-xl hover:bg-white/20 transition-all">
              Join Live Contest
            </Link>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-primary flex items-center justify-center">
              <Code2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-on-surface-variant font-medium">Problems Solved</p>
              <p className="text-2xl font-black text-on-surface">{stats?.problemsSolved ?? 0}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-on-surface-variant font-medium">Contests</p>
              <p className="text-2xl font-black text-on-surface">{stats?.contestsEntered ?? 0} Joined</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-on-surface-variant font-medium">Submissions</p>
              <p className="text-2xl font-black text-on-surface">{stats?.totalSubmissions ?? 0}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-on-surface-variant font-medium">Pass Rate</p>
              <p className="text-2xl font-black text-on-surface">{stats?.passRate ?? 0}%</p>
            </div>
          </div>
        </div>

        {/* Live Contests & Upcoming Interviews */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Active / Upcoming Contests */}
          <div className="bg-white rounded-3xl border border-outline-variant p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
              <div className="flex items-center gap-2 font-bold text-lg text-on-surface">
                <Trophy className="w-5 h-5 text-primary" /> Active & Upcoming Contests
              </div>
              <Link to="/contests" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {contests.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No active contests scheduled.</p>
              ) : (
                contests.map((c: any) => (
                  <div key={c.id} className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/50 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-on-surface">{c.title}</h4>
                      <p className="text-xs text-on-surface-variant">{c.description}</p>
                    </div>
                    <Link
                      to={`/contest/${c.id}`}
                      className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-sm hover:bg-blue-700 transition-all"
                    >
                      Join Contest
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Interviews */}
          <div className="bg-white rounded-3xl border border-outline-variant p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
              <div className="flex items-center gap-2 font-bold text-lg text-on-surface">
                <Calendar className="w-5 h-5 text-primary" /> Scheduled Mock Interviews
              </div>
              <Link to="/interviews" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {interviews.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No upcoming interviews.</p>
              ) : (
                interviews.map((inv: any) => (
                  <div key={inv.id} className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/50 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-on-surface">{inv.position}</h4>
                      <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-primary" /> Scheduled Code: {inv.roomCode}
                      </p>
                    </div>
                    <Link
                      to="/interview/waiting-room"
                      className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-emerald-700 transition-all"
                    >
                      Enter Room
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
