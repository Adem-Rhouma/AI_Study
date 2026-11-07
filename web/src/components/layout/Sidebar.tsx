import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { NAV_ITEMS, isActive } from './nav';
import { useSession } from '../../lib/session';
import { LinkButton } from '../ui/Button';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 rounded-input" aria-label="AI Mastery home">
      <img src="/favicon.svg" alt="" width={28} height={28} className="size-7 rounded-[8px]" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-small-title font-semibold tracking-tight text-ink">AI Mastery</span>
          <span className="block text-[11px] text-ink-muted">Learn how the field actually works</span>
        </span>
      )}
    </NavLink>
  );
}

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { isStaff } = useSession();
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {NAV_ITEMS.filter((item) => !item.staffOnly || isStaff).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={cn(
            'group flex items-center gap-2.5 rounded-input px-2.5 py-2 text-body transition-colors duration-150',
            isActive(pathname, item)
              ? 'bg-accent-soft font-medium text-accent-hover'
              : 'text-ink-secondary hover:bg-sunken hover:text-ink'
          )}
        >
          <item.icon size={17} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  const { session, isAuthenticated, logout } = useSession();
  if (!isAuthenticated || !session.user) {
    return (
      <div className="space-y-2">
        <p className="text-caption text-ink-muted">
          Sign in to track mastery, save notes and pick up where you left off.
        </p>
        <div className="flex gap-2">
          <LinkButton to="/login" size="sm" onClick={onNavigate}>
            Sign in
          </LinkButton>
          <LinkButton to="/register" variant="secondary" size="sm" onClick={onNavigate}>
            Create account
          </LinkButton>
        </div>
      </div>
    );
  }
  const initials = session.user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-pill bg-accent-soft text-caption font-semibold text-accent-hover"
      >
        {initials || '•'}
      </span>
      <span className="min-w-0 flex-1">
        <NavLink to="/settings" onClick={onNavigate} className="block truncate text-caption font-medium text-ink hover:text-accent-hover">
          {session.user.displayName}
        </NavLink>
        <span className="block truncate text-[11px] text-ink-muted">{session.user.role}</span>
      </span>
      <button
        type="button"
        onClick={async () => {
          await logout();
          onNavigate?.();
        }}
        className="shrink-0 cursor-pointer rounded-input px-2 py-1 text-caption text-ink-muted transition-colors hover:bg-sunken hover:text-danger"
      >
        Sign out
      </button>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Brand />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavList onNavigate={onNavigate} />
      </div>
      <div className="border-t border-line pt-3">
        <SidebarFooter onNavigate={onNavigate} />
      </div>
    </div>
  );
}
