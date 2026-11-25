import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  AVAILABLE: "success",
  RESERVED: "warning",
  ISSUED: "info",
  EXPIRED: "neutral",
  DISCARDED: "danger",
  PENDING: "warning",
  APPROVED: "info",
  FULFILLED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
  WAITLISTED: "danger",
  CRITICAL: "danger",
  URGENT: "warning",
  ROUTINE: "neutral",
  ALLOWED: "success",
  DENIED: "danger",
};

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={STATUS_TONES[value] ?? "neutral"}>{value.replaceAll("_", " ")}</Badge>;
}

export function Card({ title, description, actions, children }: {
  title?: string; description?: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: {
  title: string; description?: string; actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

export function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return <td title={title} className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, basePath, params }: {
  page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    search.set("page", String(p));
    return `${basePath}?${search.toString()}`;
  };
  return (
    <nav className="flex items-center justify-between text-sm text-slate-600" aria-label="Pagination">
      <span>
        Page {page} of {pages} · {total} record{total === 1 ? "" : "s"}
      </span>
      <div className="flex gap-2">
        {page > 1 && <a className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50" href={link(page - 1)}>Previous</a>}
        {page < pages && <a className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50" href={link(page + 1)}>Next</a>}
      </div>
    </nav>
  );
}
