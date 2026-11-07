import {
  BookOpen,
  Compass,
  FlaskConical,
  LayoutDashboard,
  Library,
  Route,
  ShieldCheck,
  Swords,
  TrendingUp,
  type LucideIcon
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  hint: string;
  staffOnly?: boolean;
  /** Matched with startsWith so detail routes keep their section highlighted. */
  match: string[];
};

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, hint: 'Your next step', match: ['/'] },
  { to: '/explore', label: 'Explore AI', icon: Compass, hint: 'The whole field, mapped', match: ['/explore'] },
  { to: '/paths', label: 'Learning Paths', icon: Route, hint: 'Structured journeys', match: ['/paths'] },
  { to: '/courses', label: 'Courses', icon: BookOpen, hint: 'Lessons and modules', match: ['/courses', '/lessons'] },
  { to: '/resources', label: 'Resources', icon: Library, hint: 'Books, papers, courses', match: ['/resources'] },
  { to: '/arena', label: 'Problem Arena', icon: Swords, hint: 'Practice with feedback', match: ['/arena'] },
  { to: '/research', label: 'Research & Discover', icon: FlaskConical, hint: 'Findings and events', match: ['/research'] },
  { to: '/progress', label: 'Progress', icon: TrendingUp, hint: 'Mastery over time', match: ['/progress'] },
  { to: '/admin', label: 'Content Studio', icon: ShieldCheck, hint: 'Author and publish', match: ['/admin'], staffOnly: true }
];

export const SECONDARY_NAV = [{ to: '/settings', label: 'Profile & Settings' }];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.match.some((prefix) => (prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)));
}
