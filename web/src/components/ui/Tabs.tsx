import type { ReactNode } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '../../lib/cn';

export type TabItem = { value: string; label: ReactNode; icon?: ReactNode; count?: number };

/** Underline tabs for in-page sections; pill tabs for compact filter bars. */
export function Tabs({
  items,
  value,
  onValueChange,
  children,
  variant = 'underline',
  className,
  ariaLabel = 'Sections'
}: {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  children?: ReactNode;
  variant?: 'underline' | 'pill';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={cn('min-w-0', className)}>
      <RadixTabs.List
        aria-label={ariaLabel}
        className={cn(
          // A scrollable strip is needed on narrow screens; the native bar is hidden because
          // overflow-x:auto also turns the vertical axis into a scroller, which draws a second bar.
          'flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          variant === 'underline' && 'border-b border-line',
          variant === 'pill' && 'flex-wrap rounded-pill border border-line bg-sunken p-1'
        )}
      >
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-caption font-medium transition-colors duration-150',
              variant === 'underline' &&
                '-mb-px border-b-2 border-transparent px-3 py-2 text-ink-secondary hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink',
              variant === 'pill' &&
                'rounded-pill px-3 py-1.5 text-ink-secondary hover:text-ink data-[state=active]:bg-raised data-[state=active]:text-ink data-[state=active]:shadow-1'
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && <span className="tnum text-ink-muted">{item.count}</span>}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children && <div className="mt-4">{children}</div>}
    </RadixTabs.Root>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RadixTabs.Content value={value} className={cn('min-w-0 outline-none', className)}>
      {children}
    </RadixTabs.Content>
  );
}
