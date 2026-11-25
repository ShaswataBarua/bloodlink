"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", roles: ["ADMIN", "BANK_STAFF", "HOSPITAL"] },
  { href: "/requests", label: "Requests", roles: ["ADMIN", "BANK_STAFF", "HOSPITAL"] },
  { href: "/inventory", label: "Inventory", roles: ["ADMIN", "BANK_STAFF", "HOSPITAL"] },
  { href: "/donors", label: "Donors", roles: ["ADMIN", "BANK_STAFF"] },
  { href: "/audit", label: "Audit log", roles: ["ADMIN"] },
  { href: "/race-lab", label: "Race Lab", roles: ["ADMIN", "BANK_STAFF"] },
  { href: "/security-lab", label: "Security Lab", roles: ["ADMIN"] },
  { href: "/me", label: "My profile", roles: ["DONOR", "ADMIN", "BANK_STAFF", "HOSPITAL"] },
];

export function NavLinks({ role }: { role: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto lg:flex-col">
      {NAV.filter((item) => item.roles.includes(role)).map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded px-3 py-2 text-sm font-medium ${
              active ? "bg-rose-800 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      Sign out
    </button>
  );
}
