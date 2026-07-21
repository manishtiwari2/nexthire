import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import {
  LayoutDashboard,
  Trophy,
  Video,
  Database,
  User,
  Settings,
  ShieldAlert,
  Send,
  PlusCircle,
  BarChart3,
  Terminal
} from 'lucide-react';

export const AppSidebar: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const candidateNav = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Contests', path: '/contests', icon: Trophy },
    { name: 'Interviews', path: '/interviews', icon: Video },
    { name: 'Question Bank', path: '/questions', icon: Database },
    { name: 'My Profile', path: '/profile', icon: User },
    { name: 'Settings', path: '/settings/editor', icon: Settings },
  ];

  const adminNav = [
    { name: 'Question Bank (Admin)', path: '/admin/questions', icon: Database },
    { name: 'Contest Management', path: '/admin/contests', icon: Trophy },
    { name: 'Create Contest', path: '/admin/contests/create', icon: PlusCircle },
    { name: 'Schedule Interview', path: '/admin/interviews/create', icon: Video },
    { name: 'Broadcast Messages', path: '/admin/system-communication', icon: Send },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] bg-surface-container-lowest border-r border-outline-variant shadow-sm z-50 flex flex-col p-6">
      {/* Brand Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center text-white shadow-sm">
          <Terminal className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-primary tracking-tight">NextHire</h1>
          <p className="text-[10px] uppercase tracking-widest text-outline font-bold">Premium DSA Prep</p>
        </div>
      </div>

      {/* Main Candidate Nav */}
      <div className="space-y-1 flex-1 overflow-y-auto pr-1">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2 px-3">
          Candidate Persona
        </div>
        {candidateNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-secondary-container text-on-secondary-container font-semibold border-l-4 border-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}

        {/* Admin Section */}
        {isAdmin && (
          <div className="pt-6 mt-6 border-t border-outline-variant space-y-1">
            <div className="text-[10px] uppercase font-bold tracking-wider text-purple-600 mb-2 px-3 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Admin Suite
            </div>
            {adminNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-purple-100 text-purple-900 font-semibold border-l-4 border-purple-600 shadow-sm'
                        : 'text-on-surface-variant hover:bg-purple-50'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 text-purple-600" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>

      {/* Upgrade / Admin Badge Footer */}
      <div className="mt-auto pt-4 border-t border-outline-variant">
        {isAdmin ? (
          <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900">
            <p className="font-bold flex items-center gap-1"><ShieldAlert className="w-4 h-4 text-purple-600" /> Admin Access Mode</p>
            <p className="text-[11px] opacity-80 mt-0.5">Full CRUD & system management enabled.</p>
          </div>
        ) : (
          <div className="p-4 bg-primary text-white rounded-xl shadow-md">
            <p className="font-bold text-sm mb-1">Upgrade to Pro</p>
            <p className="text-xs opacity-80 mb-3">Unlimited mock interviews & editorial solutions.</p>
            <button onClick={() => {}} className="w-full py-1.5 bg-white text-primary rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors">
              Go Unlimited
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
