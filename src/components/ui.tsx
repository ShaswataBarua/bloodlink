import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "badge-default",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-destructive",
  info: "badge-info",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`badge ${TONES[tone]} ${className}`}>
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

export function StatusBadge({ value, className = "" }: { value: string; className?: string }) {
  return <Badge tone={STATUS_TONES[value] ?? "neutral"} className={className}>{value.replaceAll("_", " ")}</Badge>;
}

export function Card({ title, description, actions, children, className = "" }: {
  title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card card-elevated ${className}`}>
      {(title || actions) && (
        <header className="card-header flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {description && <p className="card-description">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="card-content">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, className = "" }: { label: string; value: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`stat-card ${className}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, description, actions, className = "" }: {
  title: string; description?: string; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={`page-header ${className}`}>
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`empty-state ${className}`}>{children}</p>;
}

export function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return <td title={title} className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}

export function TableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`table-container ${className}`}>
      <table className="table">{children}</table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, basePath, params, className = "" }: {
  page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined>; className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    search.set("page", String(p));
    return `${basePath}?${search.toString()}`;
  };
  return (
    <nav className={`flex items-center justify-between text-sm text-slate-600 ${className}`} aria-label="Pagination">
      <span className="text-slate-500">
        Page {page} of {pages} · {total} record{total === 1 ? "" : "s"}
      </span>
      <div className="flex gap-2">
        {page > 1 && <a className="btn btn-outline btn-sm" href={link(page - 1)}>Previous</a>}
        {page < pages && <a className="btn btn-outline btn-sm" href={link(page + 1)}>Next</a>}
      </div>
    </nav>
  );
}

// Additional utility components
export function Input({ label, error, hint, className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string; className?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="label">{label}</label>}
      <input
        {...props}
        id={id}
        className={`input ${error ? "border-rose-500 focus:ring-rose-500 focus:border-rose-500" : ""} ${className}`}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-rose-600" role="alert">{error}</p>}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Select({ label, error, hint, className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  const id = props.id ?? props.name;
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="label">{label}</label>}
      <select
        {...props}
        id={id}
        className={`input ${error ? "border-rose-500 focus:ring-rose-500 focus:border-rose-500" : ""} ${className}`}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      >
        {children}
      </select>
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-rose-600" role="alert">{error}</p>}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Button({ variant = "primary", size = "default", className = "", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive"; size?: "default" | "sm" | "lg" }) {
  const sizeClasses = {
    default: "px-4 py-2 text-sm",
    sm: "px-3 py-1.5 text-xs",
    lg: "px-6 py-3 text-base",
  };

  const variantClasses = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    outline: "btn-outline",
    ghost: "btn-ghost",
    destructive: "btn-destructive",
  };

  return (
    <button
      {...props}
      className={`btn ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({ variant = "primary", size = "default", className = "", children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive"; size?: "default" | "sm" | "lg" }) {
  const sizeClasses = {
    default: "px-4 py-2 text-sm",
    sm: "px-3 py-1.5 text-xs",
    lg: "px-6 py-3 text-base",
  };

  const variantClasses = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    outline: "btn-outline",
    ghost: "btn-ghost",
    destructive: "btn-destructive",
  };

  return (
    <a
      {...props}
      className={`btn ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </a>
  );
}

export function Alert({ variant = "info", children, className = "" }: { variant?: "info" | "success" | "warning" | "destructive"; children: ReactNode; className?: string }) {
  const variantClasses = {
    info: "alert-info",
    success: "alert-success",
    warning: "alert-warning",
    destructive: "alert-destructive",
  };

  return (
    <div className={`alert ${variantClasses[variant]} ${className}`} role="alert">
      {children}
    </div>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`divider ${className}`} />;
}

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  return (
    <span className="tooltip" data-tooltip={content}>
      {children}
    </span>
  );
}

export function NavLink({ active, className = "", children, ...props }: { active?: boolean; className?: string; children: ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      className={`nav-link ${active ? "active" : ""} ${className}`}
    >
      {children}
    </a>
  );
}

export function Dropdown({ children, menu, trigger }: { children: ReactNode; menu: ReactNode; trigger: ReactNode }) {
  return (
    <div className="dropdown relative inline-block">
      <span>{trigger}</span>
      <div className="dropdown-menu">{menu}</div>
    </div>
  );
}

export function DropdownItem({ children, className = "", ...props }: { children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`dropdown-item ${className}`} {...props}>
      {children}
    </button>
  );
}

export function DropdownDivider({ className = "" }: { className?: string }) {
  return <hr className={`dropdown-divider ${className}`} />;
}
