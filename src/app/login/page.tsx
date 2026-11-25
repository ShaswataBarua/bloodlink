import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getActor } from "@/server/session";

export const metadata = { title: "Sign in — BloodLink" };

export default async function LoginPage() {
  if (await getActor()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-rose-800">BloodLink</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Blood bank operations</h1>
          <p className="mt-1 text-sm text-slate-600">
            Inventory, donor eligibility and emergency allocation for hospitals and blood banks.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
