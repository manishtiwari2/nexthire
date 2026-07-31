import React, { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { cn } from '../../shared/lib/cn';

interface AppLayoutProps {
  children: React.ReactNode;
  /** Optional title rendered in the top bar. */
  title?: string;
  /** Constrain the main content width (most pages). Set false for full-bleed. */
  contained?: boolean;
}

/**
 * Shared application shell: fixed sidebar on desktop, slide-in drawer on mobile,
 * sticky header, and a scrollable content region. Every authenticated page uses this
 * so spacing, background, and navigation stay identical everywhere.
 */
export const AppLayout: React.FC<AppLayoutProps> = ({ children, title, contained = true }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-outline-variant lg:block">
        <AppSidebar />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="animate-slide-in absolute inset-y-0 left-0 w-72 border-r border-outline-variant shadow-elev-3">
            <AppSidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        <AppHeader onMenuClick={() => setMobileOpen(true)} title={title} />
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className={cn(contained && 'mx-auto max-w-6xl', 'animate-fade-in')}>{children}</div>
        </main>
      </div>
    </div>
  );
};
