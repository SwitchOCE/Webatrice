import type { ReactNode } from 'react';

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-bg-elevated border border-border-subtle p-3">
      <div className="text-2xl font-modern font-bold text-text-primary tabular-nums">
        {value}
      </div>
      <div className="text-xs uppercase tracking-widest text-text-muted mt-1">{label}</div>
    </div>
  );
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
      {children}
    </h3>
  );
}
