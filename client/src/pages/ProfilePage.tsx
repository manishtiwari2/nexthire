import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { AppHeader } from '../components/layout/AppHeader';
import { AppSidebar } from '../components/layout/AppSidebar';
import { User, Github, Linkedin, Award, Flame, Save, CheckCircle } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiClient.get('/users/profile')
  });

  const profile = data?.data;

  const [bio, setBio] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [skills, setSkills] = useState('');
  const [name, setName] = useState('');
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    if (profile) {
      setBio(profile.bio || '');
      setGithubUrl(profile.githubUrl || '');
      setLinkedinUrl(profile.linkedinUrl || '');
      setSkills(profile.skills || '');
      setName(profile.user?.name || '');
    }
  }, [profile]);

  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, []);

  const updateMutation = useMutation({
    mutationFn: (updated: any) => apiClient.put('/users/profile', updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setSavedMsg(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setSavedMsg(false), 3000);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ name, bio, githubUrl, linkedinUrl, skills });
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppSidebar />
      <AppHeader />

      <main className="ml-[260px] pt-16 p-8 space-y-8 max-w-container-max mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <User className="w-6 h-6 text-primary" /> User Profile Management
          </h1>
          <p className="text-sm text-on-surface-variant">Update your developer bio, social links, and skills portfolio.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Profile Overview Card */}
            <div className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm space-y-6 text-center">
              <img
                src={profile?.user?.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex'}
                alt="Avatar"
                className="w-24 h-24 rounded-full border-4 border-primary-container mx-auto object-cover"
              />
              <div>
                <h2 className="font-bold text-xl text-on-surface">{profile?.user?.name || 'User'}</h2>
                <p className="text-xs text-slate-500">{profile?.user?.email}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-blue-50 text-blue-900 rounded-xl font-bold">
                  <p className="text-[10px] text-blue-600 uppercase">Skills</p>
                  <p className="text-lg">{profile?.userSkills?.length ?? '—'}</p>
                </div>
                <div className="p-3 bg-amber-50 text-amber-900 rounded-xl font-bold">
                  <p className="text-[10px] text-amber-600 uppercase">Profile</p>
                  <p className="text-lg">{profile?.bio ? '✓' : '—'}</p>
                </div>
              </div>
            </div>

            {/* Edit Profile Form */}
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-outline-variant shadow-sm space-y-6">
              <h3 className="font-bold text-lg text-on-surface pb-3 border-b border-outline-variant">Edit Personal Info</h3>

              {savedMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> Profile updated successfully!
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Display Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-outline-variant p-2.5 rounded-xl outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Bio</label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full border border-outline-variant p-2.5 rounded-xl outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1">
                      <Github className="w-3.5 h-3.5" /> GitHub Profile URL
                    </label>
                    <input
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      className="w-full border border-outline-variant p-2.5 rounded-xl outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1">
                      <Linkedin className="w-3.5 h-3.5" /> LinkedIn Profile URL
                    </label>
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      className="w-full border border-outline-variant p-2.5 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Skills (Comma-separated)</label>
                  <input
                    type="text"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    className="w-full border border-outline-variant p-2.5 rounded-xl outline-none"
                    placeholder="Python, JavaScript, Algorithms, System Design"
                  />
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="px-6 py-2.5 bg-primary hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{updateMutation.isPending ? 'Saving...' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
