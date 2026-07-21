import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { AppHeader } from '../components/layout/AppHeader';
import { AppSidebar } from '../components/layout/AppSidebar';
import { ShieldAlert, Plus, Trash2, Send, Database, Trophy, Video } from 'lucide-react';

export const AdminSuitePage: React.FC = () => {
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastStatus, setBroadcastStatus] = useState('');

  const [contestTitle, setContestTitle] = useState('');
  const [contestDesc, setContestDesc] = useState('');

  const queryClient = useQueryClient();

  const broadcastMutation = useMutation({
    mutationFn: (msgData: any) => apiClient.post('/notifications/broadcast', msgData),
    onSuccess: (res: any) => {
      setBroadcastStatus(res.message || 'Broadcast sent successfully!');
      setBroadcastTitle('');
      setBroadcastMsg('');
    },
    onError: (err: any) => {
      setBroadcastStatus(`Error: ${err.message || 'Failed to send broadcast'}`);
    }
  });

  const createContestMutation = useMutation({
    mutationFn: (newContest: any) => apiClient.post('/contests', newContest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      setContestTitle('');
      setContestDesc('');
      alert('Contest created successfully!');
    },
    onError: (err: any) => {
      alert(`Error creating contest: ${err.message || 'Failed'}`);
    }
  });

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    broadcastMutation.mutate({
      title: broadcastTitle,
      message: broadcastMsg,
      type: 'SYSTEM'
    });
  };

  const handleCreateContest = (e: React.FormEvent) => {
    e.preventDefault();
    createContestMutation.mutate({
      title: contestTitle,
      description: contestDesc,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 7200000).toISOString(),
      problems: []
    });
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppSidebar />
      <AppHeader />

      <main className="ml-[260px] pt-16 p-8 space-y-8 max-w-container-max mx-auto">
        <div>
          <div className="flex items-center gap-2 text-purple-700 font-bold text-2xl">
            <ShieldAlert className="w-7 h-7" /> Admin Management Suite
          </div>
          <p className="text-sm text-on-surface-variant">Full CRUD control over coding questions, speed contests, scheduled interviews, and real-time broadcasts.</p>
        </div>

        {/* System Broadcast Center */}
        <div className="bg-white rounded-3xl border border-purple-200 p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-base text-purple-900 border-b border-purple-100 pb-3">
            <Send className="w-5 h-5 text-purple-600" /> Platform System Broadcast Center
          </div>

          {broadcastStatus && (
            <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl">
              {broadcastStatus}
            </div>
          )}

          <form onSubmit={handleBroadcast} className="space-y-3">
            <input
              type="text"
              required
              placeholder="Announcement Title (e.g. NextHire v2.0 Released!)"
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              className="w-full border border-outline-variant p-2.5 rounded-xl text-xs outline-none"
            />
            <textarea
              required
              rows={3}
              placeholder="Broadcast Message Content"
              value={broadcastMsg}
              onChange={(e) => setBroadcastMsg(e.target.value)}
              className="w-full border border-outline-variant p-2.5 rounded-xl text-xs outline-none"
            />
            <button
              type="submit"
              disabled={broadcastMutation.isPending}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              {broadcastMutation.isPending ? 'Sending...' : 'Send Global Broadcast'}
            </button>
          </form>
        </div>

        {/* Contest Creator */}
        <div className="bg-white rounded-3xl border border-outline-variant p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-base text-on-surface border-b border-outline-variant pb-3">
            <Trophy className="w-5 h-5 text-primary" /> Create Speed Contest
          </div>

          <form onSubmit={handleCreateContest} className="space-y-3">
            <input
              type="text"
              required
              placeholder="Contest Title (e.g. Weekly Sprint #43)"
              value={contestTitle}
              onChange={(e) => setContestTitle(e.target.value)}
              className="w-full border border-outline-variant p-2.5 rounded-xl text-xs outline-none"
            />
            <textarea
              required
              rows={2}
              placeholder="Contest Description & Rules"
              value={contestDesc}
              onChange={(e) => setContestDesc(e.target.value)}
              className="w-full border border-outline-variant p-2.5 rounded-xl text-xs outline-none"
            />
            <button
              type="submit"
              disabled={createContestMutation.isPending}
              className="px-6 py-2.5 bg-primary hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              {createContestMutation.isPending ? 'Creating...' : 'Launch Contest'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
