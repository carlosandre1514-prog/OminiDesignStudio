import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useSettings } from '@/core/settings/settings';
import { AppShell } from '@/ui/AppShell';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { Toaster } from '@/ui/Toaster';
import Dashboard from '@/pages/Dashboard';

const Projects = lazy(() => import('@/pages/Projects'));
const Assets = lazy(() => import('@/pages/Assets'));
const Templates = lazy(() => import('@/pages/Templates'));
const History = lazy(() => import('@/pages/History'));
const Storage = lazy(() => import('@/pages/Storage'));
const Settings = lazy(() => import('@/pages/Settings'));
const Workspace = lazy(() => import('@/pages/Workspace'));
const NotFound = lazy(() => import('@/pages/NotFound'));

export default function App() {
  const { load, settings } = useSettings();
  useEffect(() => void load(), [load]);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
  }, [settings.reduceMotion]);

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<div className="p-8 text-sm text-ink-400">Carregando…</div>}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<Projects />} />
              <Route path="assets" element={<Assets />} />
              <Route path="templates" element={<Templates />} />
              <Route path="history" element={<History />} />
              <Route path="storage" element={<Storage />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="project/:projectId" element={<Workspace />} />
            <Route path="project/:projectId/:moduleId" element={<Workspace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Toaster />
    </BrowserRouter>
  );
}
