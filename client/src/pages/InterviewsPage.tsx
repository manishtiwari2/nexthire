import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { AppHeader } from '../components/layout/AppHeader';
import { AppSidebar } from '../components/layout/AppSidebar';
import { Video, Camera, Mic, CheckCircle2, Clock, Play, Award, FileText, ArrowRight } from 'lucide-react';
import { MonacoCodeEditor } from '../components/editor/MonacoCodeEditor';

export const InterviewsPage: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['interviews'],
    queryFn: () => apiClient.get('/interviews')
  });

  const interviews = data?.data || [];

  return (
    <div className="min-h-screen bg-surface">
      <AppSidebar />
      <AppHeader />

      <main className="ml-[260px] pt-16 p-8 space-y-8 max-w-container-max mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Video className="w-6 h-6 text-primary" /> Technical Mock Interviews
          </h1>
          <p className="text-sm text-on-surface-variant">Real-time collaborative coding, video chat, and automated performance evaluation.</p>
        </div>

        {/* Scheduled Sessions */}
        <div className="bg-white rounded-3xl border border-outline-variant p-6 space-y-4 shadow-sm">
          <h3 className="font-bold text-lg text-on-surface pb-3 border-b border-outline-variant">Scheduled Sessions</h3>

          <div className="space-y-4">
            {isLoading ? (
              <p className="text-xs text-slate-500">Loading interview sessions...</p>
            ) : interviews.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No scheduled interviews found.</p>
            ) : (
              interviews.map((inv: any) => (
                <div key={inv.id} className="p-5 bg-surface-container-low rounded-2xl border border-outline-variant/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
                        {inv.status}
                      </span>
                      <span className="text-xs font-mono text-slate-500">Room Code: {inv.roomCode}</span>
                    </div>
                    <h4 className="font-bold text-base text-on-surface">{inv.position}</h4>
                    <p className="text-xs text-slate-600">Candidate: {inv.candidate?.name || 'Alex Rivera'} | Interviewer: {inv.interviewer?.name || 'Admin User'}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    {inv.report ? (
                      <Link
                        to="/interview/report"
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-100 text-purple-800 text-xs font-bold rounded-xl hover:bg-purple-200 transition-all"
                      >
                        <FileText className="w-4 h-4" /> View Report
                      </Link>
                    ) : null}

                    <Link
                      to="/interview/waiting-room"
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-current" /> Enter Waiting Room
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// Pre-Interview Waiting Room with Hardware Checks
export const WaitingRoomPage: React.FC = () => {
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const navigate = useNavigate();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6 text-on-surface">
      <div className="w-full max-w-2xl bg-white border border-outline-variant rounded-3xl p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant">
          <div>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">Device Check</span>
            <h1 className="text-xl font-bold text-on-surface mt-1">Pre-Interview Waiting Room</h1>
          </div>
          <span className="text-xs font-mono text-slate-500">Room Code: NH-LIVE-8821</span>
        </div>

        {/* Video / Camera Preview */}
        <div className="relative bg-slate-900 rounded-2xl h-64 flex items-center justify-center overflow-hidden shadow-inner">
          {cameraOn ? (
            <div className="text-center text-slate-300 space-y-2">
              <Camera className="w-12 h-12 mx-auto text-emerald-400 animate-pulse" />
              <p className="text-xs font-medium">Camera Feed Active (720p HD)</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Camera is turned off.</p>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-800/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700">
            <button
              onClick={() => setCameraOn(!cameraOn)}
              className={`p-2 rounded-full transition-colors ${cameraOn ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMicOn(!micOn)}
              className={`p-2 rounded-full transition-colors ${micOn ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Checklist */}
        <div className="grid grid-cols-3 gap-4 text-xs font-medium">
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Microphone Passed
          </div>
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Camera 720p OK
          </div>
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Latency: 18ms
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-outline-variant">
          <Link to="/interviews" className="text-xs font-bold text-slate-600 hover:underline">
            Cancel Session
          </Link>
          <button
            onClick={() => navigate('/interview/live')}
            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
          >
            <span>Join Live Interview ({countdown > 0 ? `${countdown}s` : 'Ready'})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Live Interview Session with Monaco Editor & Video Overlay
export const LiveInterviewSessionPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      <header className="h-14 bg-slate-900 text-white px-6 flex items-center justify-between shadow-md z-10 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <span className="font-bold text-sm text-blue-400">NH-LIVE-8821</span>
          <div className="h-4 w-px bg-slate-700" />
          <h1 className="font-bold text-sm">Senior Full Stack Engineer Interview</h1>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/interview/report')}
            className="px-5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-sm"
          >
            End & Generate Report
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left: Problem & Video Feed */}
        <div className="w-[40%] flex flex-col gap-4">
          <div className="bg-slate-900 rounded-2xl h-48 p-4 flex items-center justify-around border border-slate-800 text-white shadow-md">
            <div className="text-center space-y-1">
              <div className="w-16 h-16 bg-blue-600 rounded-full mx-auto flex items-center justify-center text-xl font-bold">AR</div>
              <p className="text-xs font-bold">Alex Rivera (Candidate)</p>
            </div>
            <div className="text-center space-y-1">
              <div className="w-16 h-16 bg-purple-600 rounded-full mx-auto flex items-center justify-center text-xl font-bold">AU</div>
              <p className="text-xs font-bold">Admin User (Interviewer)</p>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-2xl border border-outline-variant p-6 overflow-y-auto space-y-3 shadow-sm">
            <h2 className="text-lg font-bold text-on-surface">Binary Search Tree Search</h2>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Given the root of a binary search tree (BST) and an integer val, find the node in the BST that the node's value equals val.
            </p>
          </div>
        </div>

        {/* Right: Monaco Editor */}
        <div className="w-[60%] h-full">
          <MonacoCodeEditor roomCode="NH-LIVE-8821" />
        </div>
      </div>
    </div>
  );
};

// Post-Interview Evaluation Report Card
export const InterviewReportPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface p-8 text-on-surface">
      <div className="max-w-3xl mx-auto bg-white border border-outline-variant rounded-3xl p-8 shadow-xl space-y-8">
        <div className="flex items-center justify-between pb-6 border-b border-outline-variant">
          <div>
            <span className="px-3 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-full">Automated Evaluation</span>
            <h1 className="text-2xl font-bold text-on-surface mt-1">Interview Performance Report</h1>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-primary">94 / 100</div>
            <p className="text-xs text-slate-500 font-medium">Overall Candidate Score</p>
          </div>
        </div>

        {/* Rubric Gauge Bars */}
        <div className="grid grid-cols-2 gap-6">
          <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant space-y-1">
            <p className="text-xs font-bold text-slate-600">Problem Solving & Algorithms</p>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-primary h-full w-[95%]" />
            </div>
            <p className="text-right text-[11px] font-bold text-primary">95%</p>
          </div>

          <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant space-y-1">
            <p className="text-xs font-bold text-slate-600">Code Quality & Modularization</p>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full w-[92%]" />
            </div>
            <p className="text-right text-[11px] font-bold text-emerald-600">92%</p>
          </div>

          <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant space-y-1">
            <p className="text-xs font-bold text-slate-600">Verbal Communication</p>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-purple-600 h-full w-[96%]" />
            </div>
            <p className="text-right text-[11px] font-bold text-purple-600">96%</p>
          </div>

          <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant space-y-1">
            <p className="text-xs font-bold text-slate-600">System Architecture & Design</p>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-amber-600 h-full w-[90%]" />
            </div>
            <p className="text-right text-[11px] font-bold text-amber-600">90%</p>
          </div>
        </div>

        {/* Detailed Feedback */}
        <div className="space-y-4 text-xs leading-relaxed text-on-surface-variant">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1 text-emerald-900">
            <h4 className="font-bold text-sm">Key Strengths:</h4>
            <p>Optimal time complexity analysis, crisp modular function breakdown, clear communication throughout the coding session.</p>
          </div>

          <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl space-y-1 text-purple-900">
            <h4 className="font-bold text-sm">Actionable Improvements:</h4>
            <p>Consider edge case handling for empty stream inputs and initial null tree roots.</p>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-outline-variant">
          <Link to="/dashboard" className="px-6 py-2.5 bg-primary text-white font-bold text-xs rounded-xl shadow-sm hover:bg-blue-700">
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};
