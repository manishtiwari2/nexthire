import React from 'react';
import { Outlet } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { Spinner } from '../../shared/components/ui';

/**
 * Persistent application shell.
 *
 * The sidebar and header (inside AppLayout) mount once and stay mounted for the whole
 * authenticated session — only the routed page inside <Outlet/> swaps on navigation. This is
 * what removes the shutter/blank/flicker: the chrome (and the avatar <img>) never remounts,
 * so it never reloads.
 *
 * The nested Suspense boundary is deliberate: a lazy page chunk that is still loading shows a
 * small content-area spinner *inside* the shell, rather than the full-viewport PageLoader that
 * would blank the entire screen (sidebar included) on every navigation.
 */
export const AppShell: React.FC = () => (
  <AppLayout>
    <React.Suspense
      fallback={
        <div className="flex min-h-[60vh] w-full items-center justify-center">
          <Spinner size="lg" label="Loading…" />
        </div>
      }
    >
      <Outlet />
    </React.Suspense>
  </AppLayout>
);
