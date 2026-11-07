import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Menu, Moon, Search, Settings, Sun, User } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { useSession } from '../../lib/session';
import { IconButton } from '../ui/Button';
import { Menu as MenuRoot, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Input } from '../ui/Field';

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { isAuthenticated, session, logout } = useSession();
  const [term, setTerm] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = term.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  const account = (
    <IconButton label="Account menu" size="sm" className="border-line-strong">
      <User size={17} aria-hidden />
    </IconButton>
  );

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center gap-2 border-b border-line bg-raised/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-raised/70 sm:px-4">
      <IconButton label="Open navigation" size="sm" className="lg:hidden" onClick={onOpenNav}>
        <Menu size={18} aria-hidden />
      </IconButton>

      <form onSubmit={submit} role="search" className="relative min-w-0 flex-1 sm:max-w-md">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search topics, lessons, problems, resources…"
          aria-label="Search the platform"
          className="h-9 py-0 pl-9 text-caption"
        />
      </form>

      <div className="ml-auto flex items-center gap-1">
        <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} size="sm" onClick={toggle}>
          {theme === 'dark' ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
        </IconButton>

        {isAuthenticated ? (
          <MenuRoot label="Account" trigger={account}>
            <MenuLabel>{session.user?.email}</MenuLabel>
            <MenuSeparator />
            <MenuItem icon={<User size={15} aria-hidden />} onSelect={() => navigate('/settings?tab=profile')}>
              Your profile
            </MenuItem>
            <MenuItem icon={<Settings size={15} aria-hidden />} onSelect={() => navigate('/settings')}>
              Settings
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              tone="danger"
              icon={<LogOut size={15} aria-hidden />}
              onSelect={() => {
                void logout().then(() => navigate('/'));
              }}
            >
              Sign out
            </MenuItem>
          </MenuRoot>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="ml-1 rounded-input px-3 py-1.5 text-caption font-medium text-ink-secondary transition-colors hover:bg-sunken hover:text-ink"
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
