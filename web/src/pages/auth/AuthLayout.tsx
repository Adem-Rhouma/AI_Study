import { Outlet } from 'react-router-dom';
import { Brand } from '../../components/layout/Sidebar';

/** Auth screens sit outside the app shell: one focused column, no navigation to get lost in. */
export function AuthLayout() {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-surface px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 12%, var(--accent-soft), transparent 42%), radial-gradient(circle at 82% 78%, var(--info-soft), transparent 46%)'
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <div className="rounded-modal border border-line bg-raised p-6 shadow-2">
          <Outlet />
        </div>
        <p className="mt-5 text-center text-caption text-ink-muted">
          AI Mastery keeps your notes, progress and mastery estimates private to your account.
        </p>
      </div>
    </div>
  );
}
