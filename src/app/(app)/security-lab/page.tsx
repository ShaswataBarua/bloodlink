import { SecurityLab } from "@/components/SecurityLab";
import { Card, PageHeader } from "@/components/ui";
import { requirePageActor } from "@/server/guard";

export const metadata = { title: "Security Lab — BloodLink" };

export default async function SecurityLabPage() {
  await requirePageActor(["ADMIN"]);

  return (
    <>
      <PageHeader
        title="Security Lab"
        description="Each button runs a real attack against the live policy, service and database layers, then shows the HTTP status and the audit row it produced."
      />

      <SecurityLab />

      <Card title="What protects the system">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>One policy matrix (role × action × ownership) is consulted by every route; there are no scattered role checks.</li>
          <li>Strict zod schemas reject unknown fields, so a client cannot mass-assign role, email or tenant ownership.</li>
          <li>Cross-tenant reads return 404 and write a DENIED audit row, so existence is not leaked.</li>
          <li>Sessions are random 256-bit tokens stored only as SHA-256 hashes, in httpOnly + SameSite=Lax cookies, expiring after 8 hours and revoked on logout.</li>
          <li>Login is rate-limited per IP and per email; five failures lock the account for 15 minutes.</li>
          <li>The audit table is append-only via a database trigger and hash-chained; tampering is detectable with the verify button on the Audit page.</li>
        </ul>
      </Card>
    </>
  );
}
