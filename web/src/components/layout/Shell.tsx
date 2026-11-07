import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Drawer } from '../ui/Overlay';

/** App chrome: fixed rail on desktop, drawer nav on tablet/mobile, sticky top bar, scroll reset per route. */
export function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-input focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--rail-width)] border-r border-line bg-raised lg:block">
        <Sidebar />
      </aside>

      <Drawer open={navOpen} onOpenChange={setNavOpen} title="Menu" className="lg:hidden">
        <Sidebar onNavigate={() => setNavOpen(false)} />
      </Drawer>

      <div className="lg:pl-[var(--rail-width)]">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 text-caption text-ink-muted sm:px-6">
      <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p>AI Mastery — a structured, rigorous path through the field of artificial intelligence.</p>
        <p className="tnum">Curriculum, problems and resources are curated by hand and versioned in this build.</p>
      </div>
    </footer>
  );
}
