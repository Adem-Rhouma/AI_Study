import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

const OVERLAY = 'fixed inset-0 z-50 bg-overlay/70 anim-fade';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            'overflow-y-auto rounded-modal border border-line bg-raised p-5 shadow-3 anim-pop',
            size === 'sm' && 'max-w-sm',
            size === 'md' && 'max-w-lg',
            size === 'lg' && 'max-w-3xl',
            className
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="text-h3 font-semibold text-ink">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-caption text-ink-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close dialog" className="-mr-1 -mt-1 rounded-input p-1 text-ink-muted transition-colors hover:bg-sunken hover:text-ink">
                <X size={18} aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Dialog.Close asChild>
            <Button variant="secondary" disabled={busy}>
              {cancelLabel}
            </Button>
          </Dialog.Close>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-body text-ink-secondary">{body}</div>
    </Modal>
  );
}

/** Side sheet used for navigation and filters on narrow viewports. */
export function Drawer({
  open,
  onOpenChange,
  title,
  side = 'left',
  children,
  className
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  side?: 'left' | 'right';
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content
          className={cn(
            'fixed top-0 z-50 flex h-full w-[min(20rem,calc(100vw-2rem))] flex-col border-line bg-raised shadow-3',
            side === 'left' ? 'left-0 border-r anim-slide-left' : 'right-0 border-l anim-slide-right',
            className
          )}
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <Dialog.Title className="text-small-title font-semibold text-ink">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close panel" className="rounded-input p-1 text-ink-muted transition-colors hover:bg-sunken hover:text-ink">
                <X size={18} aria-hidden />
              </button>
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
