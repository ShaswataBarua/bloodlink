import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/RegisterForm";
import { getActor } from "@/server/session";

export const metadata = { title: "Donor registration — BloodLink" };

export default async function RegisterPage() {
  if (await getActor()) redirect("/");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-rose-800">BloodLink</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Donor registration</h1>
        <p className="mt-1 text-sm text-slate-600">
          Eligibility (age 18-60, at least 50 kg) is checked immediately. Staff accounts are created by an administrator.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <RegisterForm />
      </div>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already registered? <Link href="/login" className="font-medium text-rose-800 underline">Sign in</Link>
      </p>
    </main>
  );
}
