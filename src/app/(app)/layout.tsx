import { LogoutButton, NavLinks } from "@/components/AppNav";
import { requirePageActor } from "@/server/guard";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  BANK_STAFF: "Blood bank staff",
  HOSPITAL: "Hospital desk",
  DONOR: "Donor",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-rose-800">BloodLink</p>
          <p className="mt-0.5 text-sm font-medium text-slate-900">Operations console</p>
        </div>
        <div className="px-2 pb-4">
          <NavLinks role={actor.role} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <div className="text-sm">
            <span className="font-medium text-slate-900">{actor.name}</span>
            <span className="ml-2 text-slate-500">{ROLE_LABEL[actor.role] ?? actor.role}</span>
          </div>
          <LogoutButton />
        </header>
        <main className="mx-auto max-w-7xl space-y-6 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
