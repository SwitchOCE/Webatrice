import { ReactNode, SyntheticEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Same severity levels the pre-redo MUI `Alert` accepted. Callers
 *  passing 'success' / 'info' / 'warning' / 'error' keep working. */
export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';

export interface ToastProps {
  open: boolean;
  onClose: (event?: SyntheticEvent) => void;
  severity?: ToastSeverity;
  autoHideDuration?: number;
  children?: ReactNode;
  // Optional icon override for cases where none of the four severity
  // buckets fit semantically (e.g. incoming private-chat toasts show
  // a MessageSquare, not a success checkmark). Pass a lucide-react
  // icon component; the pill's iconColor still comes from severity.
  icon?: LucideIcon;
  onFocusChange?: (focused: boolean) => void;
}

const SEVERITY_ICON: Record<ToastSeverity, LucideIcon> = {
  success: CheckCircle,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};
const SEVERITY_COLOR: Record<ToastSeverity, string> = {
  success: 'text-success',
  info: 'text-sky-400 light:text-sky-700',
  warning: 'text-warning',
  error: 'text-danger',
};

function Toast({
  open,
  onClose,
  severity = 'success',
  autoHideDuration = 10000,
  children,
  icon,
  onFocusChange,
}: ToastProps) {
  // Delay the slide-in one frame so the initial `translate-x-full`
  // paints first and the transition actually animates. Without this,
  // React commits both classes in the same frame and there's no
  // visible slide.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(autoHideDuration);
  useEffect(() => {
    remaining.current = autoHideDuration;
  }, [open, autoHideDuration]);
  useEffect(() => {
    if (!open || paused || autoHideDuration <= 0) {
      return;
    }
    const started = Date.now();
    const timer = window.setTimeout(() => onClose(), Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [open, paused, autoHideDuration, onClose]);

  if (!open) {
    return null;
  }

  const Icon = icon ?? SEVERITY_ICON[severity];
  const iconColor = SEVERITY_COLOR[severity];

  return (
    <div
      data-testid="toast"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        setFocused(true);
        onFocusChange?.(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
          onFocusChange?.(false);
        }
      }}
      className={[
        'pointer-events-auto flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-lg',
        'bg-bg-surface border border-border-subtle shadow-glow',
        'text-sm text-text-primary min-w-[240px] max-w-md',
        'transition-transform duration-200 ease-out',
        entered ? 'translate-x-0' : 'translate-x-[calc(100%+2rem)]',
      ].join(' ')}
    >
      <Icon size={18} className={`${iconColor} shrink-0`} />
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        onClick={() => onClose()}
        className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
        title={t('Common.action.dismiss')}
        aria-label={t('Common.action.dismiss')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default Toast;
