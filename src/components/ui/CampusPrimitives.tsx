import React from 'react';

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold text-[var(--brand-primary)] tracking-tight">{eyebrow}</p>
        )}
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600 mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'default' | 'brand' | 'success' | 'warning';
}) {
  const valClass =
    accent === 'brand'
      ? 'text-[#0B3321]'
      : accent === 'success'
        ? 'text-[#16A34A]'
        : accent === 'warning'
          ? 'text-amber-700'
          : 'text-slate-900';

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`font-display text-2xl sm:text-3xl font-bold font-mono tabular-nums mt-1 ${valClass}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-slate-500 mt-1 truncate">{hint}</p>}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  rightSlot,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 ${className}`}>
      {(title || rightSlot) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-100">
          <div>
            {title && <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>}
          </div>
          {rightSlot && <div className="shrink-0">{rightSlot}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
      <div className="w-11 h-11 rounded-2xl bg-[#E8F3EC] text-[#146C43] flex items-center justify-center mx-auto">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-display text-base sm:text-lg font-bold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">{description}</p>
      {action && <div className="pt-1 flex justify-center">{action}</div>}
    </div>
  );
}
