// Small shared building blocks for the redesigned screens: page header,
// segmented control, student avatar, plan badges, empty state and a sheet
// (bottom sheet on phones, centered dialog on larger screens).
import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { getGradeColor, getInitials } from '../lib/gradeUtils';
import { useI18n } from '../i18n';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-6">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={value === o.value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StudentAvatar({
  first,
  last,
  grade,
  picture,
  size = 40,
}: {
  first: string;
  last: string;
  grade?: number | string | null;
  picture?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (picture && picture.trim()) {
    return <img src={picture} alt="" style={style} className="rounded-full object-cover shrink-0" />;
  }
  return (
    <div
      style={style}
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${getGradeColor(grade ?? -1)}`}
      aria-hidden="true"
    >
      {getInitials(first, last)}
    </div>
  );
}

/** Colour per plan type. One hue per program, used everywhere the plan shows. */
export const PLAN_STYLES: Record<string, string> = {
  IEP: 'plan-chip plan-iep',
  '504': 'plan-chip plan-504',
  ELL: 'plan-chip plan-ell',
  BIP: 'plan-chip plan-bip',
  Gifted: 'plan-chip plan-gifted',
  Health: 'plan-chip plan-health',
};

export function PlanBadge({ type }: { type: string }) {
  return (
    <span className={PLAN_STYLES[type] ?? 'plan-chip'} title={type}>
      {type}
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mb-4">{icon}</div>
      <p className="font-semibold text-gray-900">{title}</p>
      {body && <p className="text-sm text-gray-500 mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal ${wide ? 'max-w-3xl' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="icon-btn" aria-label={t('Close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
        {footer && <div className="flex gap-3 mt-6">{footer}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function formatShortDate(d: string | null | undefined, lang: string): string {
  if (!d) return '-';
  const date = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
