import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { Bell, Search, LogOut, User as UserIcon, Shield, Settings, Sparkles } from 'lucide-react';

export const AppHeader: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="fixed top-0 right-0 left-[260px] h-16 bg-surface/80 backdrop-blur-md border-b border-outline-variant z-40 flex items-center justify-between px-8 shadow-sm">
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <div className="relative w-full focus-within:ring-2 focus-within:ring-primary/20 rounded-lg">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input
            className="w-full bg-surface-container-low border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary outline-none"
            placeholder="Search problems, contests, candidates..."
            type="text"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <Link to="/notifications" aria-label="Notifications" className="relative p-2 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-surface-container-low">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
          </Link>
          <Link to="/settings/editor" aria-label="Settings" className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-surface-container-low">
            <Settings className="w-5 h-5" />
          </Link>
        </div>

        <div className="h-6 w-[1px] bg-outline-variant" />

        {/* User Dropdown */}
        <div className="flex items-center gap-3">
          <Link to="/profile" className="flex items-center gap-3 group">
            <div className="text-right">
              <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{user?.name || 'Alex Rivera'}</p>
              <div className="flex items-center justify-end gap-1">
                {user?.role === 'ADMIN' ? (
                  <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                    <Shield className="w-3 h-3" /> ADMIN
                  </span>
                ) : (
                  <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                    <Sparkles className="w-3 h-3" /> RANK #42
                  </span>
                )}
              </div>
            </div>
            <img
              className="w-9 h-9 rounded-full border-2 border-primary-container object-cover"
              src={user?.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex'}
              alt={user?.name}
            />
          </Link>

          <button
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
            className="p-2 text-on-surface-variant hover:text-error transition-colors rounded-lg hover:bg-red-50 ml-2"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
