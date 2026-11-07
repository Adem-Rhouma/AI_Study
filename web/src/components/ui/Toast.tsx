import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

type ToastInput = Omit<Toast, 'id'>;

type ToastValue = {
  push: (toast: ToastInput) => void;
  info: (title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  danger: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastValue | null>(null);

const TONE_STYLE: Record<ToastTone, string> = {
  info: 'border-info/40 bg-raised text-ink',
  success: 'border-success/40 bg-raised text-ink',
  warning: 'border-warning/50 bg-raised text-ink',
  danger: 'border-danger/45 bg-raised text-ink'
};

const TONE_ICON: Record<ToastTone, ReactNode> = {
  info: <Info size={16} className="text-info" aria-hidden />,
  success: <CheckCircle2 size={16} className="text-success" aria-hidden />,
  warning: <AlertTriangle size={16} className="text-warning" aria-hidden />,
  danger: <TriangleAlert size={16} className="text-danger" aria-hidden />
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), toast.tone === 'danger' ? 8000 : 5000)
      );
    },
    [dismiss]
  );

  const value = useMemo<ToastValue>(
    () => ({
      push,
      dismiss,
      info: (title, description) => push({ tone: 'info', title, description }),
      success: (title, description) => push({ tone: 'success', title, description }),
      warning: (title, description) => push({ tone: 'warning', title, description }),
      danger: (title, description) => push({ tone: 'danger', title, description })
    }),
    [dismiss, push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-card border p-3 shadow-2 anim-rise',
              TONE_STYLE[toast.tone]
            )}
          >
            <span className="mt-0.5 shrink-0">{TONE_ICON[toast.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-semibold text-ink">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-caption text-ink-secondary">{toast.description}</p>}
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                  className="mt-1.5 cursor-pointer text-caption font-medium text-accent underline underline-offset-2"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-input p-1 text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
