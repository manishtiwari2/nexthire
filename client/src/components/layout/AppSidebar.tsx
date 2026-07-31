import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { Trophy, Database, PlusCircle, ShieldCheck, Terminal, Sparkles, X } from 'lucide-react';
import { cn } from '../../shared/lib/cn';
import { Button } from '../../shared/components/ui';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
}

const candidateNav: NavItem[] = [
  { name: 'Assessments', path: '/contests', icon: Trophy },
  { name: 'Question Bank', path: '/questions', icon: Database },
];

const adminNav: NavItem[] = [
  { name: 'Create Question', path: '/admin/questions/create', icon: Database },
  { name: 'Create Assessment', path: '/admin/contests/create', icon: PlusCircle },
];

const NavSection: React.FC<{ label: React.ReactNode; items: NavItem[]; onNavigate?: () => void }> = ({
  label,
  items,
  onNavigate,
}) => (
  <div className="space-y-1">
    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface-muted">{label}</p>
    {items.map(({ name, path, icon: Icon }) => (
      <NavLink
        key={path}
        to={path}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary/12 text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-on-surface-muted group-hover:text-on-surface')} />
            <span>{name}</span>
          </>
        )}
      </NavLink>
    ))}
  </div>
);

export const AppSidebar: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { user } = useAuthStore();
  const { addToast } = useNotificationStore();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="flex h-full flex-col bg-surface-container-lowest">
      {/* Brand */}
      <div className="flex h-16 items-center justify-between border-b border-outline-variant px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary shadow-elev-1">
            <Terminal className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold tracking-tight text-on-surface">NextHire</h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-on-surface-muted">DSA Platform</p>
          </div>
        </div>
        {onNavigate && (
          <button
            onClick={onNavigate}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <NavSection label="Workspace" items={candidateNav} onNavigate={onNavigate} />
        {isAdmin && (
          <NavSection
            label={
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3 text-tertiary" /> Admin
              </span>
            }
            items={adminNav}
            onNavigate={onNavigate}
          />
        )}
      </nav>

      {/* Footer card */}
      <div className="border-t border-outline-variant p-3">
        {isAdmin ? (
          <div className="rounded-xl border border-tertiary/25 bg-tertiary-container/50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-on-tertiary-container">
              <ShieldCheck className="h-3.5 w-3.5 text-tertiary" /> Admin access
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-on-surface-variant">Full question & assessment management enabled.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-primary/20 bg-primary/8 p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
              <Sparkles className="h-4 w-4 text-primary" /> NextHire Pro
            </p>
            <p className="mt-0.5 mb-2.5 text-[11px] leading-snug text-on-surface-variant">Unlimited mock interviews & editorial solutions.</p>
            <Button
              size="sm"
              fullWidth
              onClick={() => addToast('NextHire Pro', 'Pro tier plans are coming soon in v2.1!', 'info')}
            >
              Go Unlimited
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
