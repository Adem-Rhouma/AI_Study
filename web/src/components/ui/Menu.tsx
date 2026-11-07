import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '../../lib/cn';

export const MENU_ITEM =
  'flex w-full cursor-pointer items-center gap-2 rounded-input px-2.5 py-1.5 text-body text-ink ' +
  'outline-none transition-colors data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-hover ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

export function Menu({
  trigger,
  children,
  align = 'end',
  className,
  label
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  label: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          aria-label={label}
          className={cn(
            'z-50 min-w-48 rounded-card border border-line bg-raised p-1.5 shadow-2 anim-rise',
            className
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled,
  tone = 'default',
  icon
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  icon?: ReactNode;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={() => onSelect?.()}
      className={cn(MENU_ITEM, tone === 'danger' && 'text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger')}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuLink({ href, children, icon }: { href: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <DropdownMenu.Item asChild>
      <a href={href} className={MENU_ITEM}>
        {icon}
        {children}
      </a>
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1.5 h-px bg-[var(--border-subtle)]" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="eyebrow px-2.5 pb-1 pt-1.5 text-caption">{children}</DropdownMenu.Label>;
}

export function Tip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tooltip.Root delayDuration={250}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-input border border-line bg-inverse px-2.5 py-1.5 text-caption text-ink-inverse shadow-2 anim-fade"
        >
          {label}
          <Tooltip.Arrow className="fill-[var(--bg-inverse)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function TipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider skipDelayDuration={400}>{children}</Tooltip.Provider>;
}

export function PopoverPanel({
  trigger,
  children,
  align = 'start',
  className,
  width = 'auto'
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  width?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          style={{ width }}
          className={cn('z-50 rounded-card border border-line bg-raised p-3 shadow-2 anim-rise', className)}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
