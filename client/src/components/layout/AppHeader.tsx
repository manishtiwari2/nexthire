import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { Menu, LogOut, ShieldCheck, Sparkles, ChevronDown } from 'lucide-react';
import { Badge } from '../../shared/components/ui';
import { cn } from '../../shared/lib/cn';

export const AppHeader: React.FC<{ onMenuClick?: () => void; title?: string }> = ({ onMenuClick, title }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const avatar = user?.avatarUrl || `https://api.dicebear.com/7.x/glass/svg?seed=${encodeURIComponent(user?.email || 'user')}`;

  return (
    <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-outline-variant px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        {title && <h2 className="text-sm font-semibold text-on-surface">{title}</h2>}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-2.5 rounded-xl border border-transparent py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-outline-variant hover:bg-surface-container-high"
        >
          <img src={avatar} alt="" className="h-8 w-8 rounded-lg border border-outline-variant bg-surface-container object-cover" />
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-semibold leading-tight text-on-surface">{user?.name || user?.email || 'User'}</span>
            <span className="block text-[10px] leading-tight text-on-surface-muted">{isAdmin ? 'Administrator' : 'Candidate'}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 text-on-surface-muted transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <div
            role="menu"
            className="animate-scale-in absolute right-0 mt-2 w-60 origin-top-right overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-elev-3"
          >
            <div className="flex items-center gap-3 border-b border-outline-variant p-3">
              <img src={avatar} alt="" className="h-10 w-10 rounded-lg border border-outline-variant object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-on-surface">{user?.name || 'User'}</p>
                <p className="truncate text-xs text-on-surface-muted">{user?.email}</p>
              </div>
            </div>
            <div className="p-2">
              <Badge variant={isAdmin ? 'accent' : 'primary'} className="w-full justify-center">
                {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                {isAdmin ? 'Admin Access' : 'Candidate'}
              </Badge>
            </div>
            <div className="border-t border-outline-variant p-1.5">
              <button
                onClick={handleLogout}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-error-container hover:text-danger"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
