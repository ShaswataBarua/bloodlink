import { RaceLab } from "@/components/RaceLab";
import { Card, PageHeader } from "@/components/ui";
import { requirePageActor } from "@/server/guard";

export const metadata = { title: "Race Lab — BloodLink" };

export default async function RaceLabPage() {
  await requirePageActor(["ADMIN", "BANK_STAFF"]);

  return (
    <>
      <PageHeader
        title="Race Lab"
        description="Concurrency evidence: N real reservation transactions compete for the same stock."
      />

      <Card title="Concurrent reservation run">
        <RaceLab />
      </Card>

      <Card title="How the guarantee is produced">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>Each reservation is one database transaction: <code className="font-mono text-xs">SELECT … FOR UPDATE SKIP LOCKED</code>, then update units, insert allocations, update the request, write the audit row, commit.</li>
          <li>SKIP LOCKED makes losers skip the row the winner already locked instead of waiting; they see no candidate and go to the waitlist.</li>
          <li>A partial unique index on <code className="font-mono text-xs">allocations(unit_id) WHERE released_at IS NULL</code> makes a second active allocation impossible even if application logic were wrong.</li>
          <li>Serialization failures and deadlocks are retried with bounded exponential backoff, so a user never sees a 500 from contention.</li>
          <li>A crash mid-transaction rolls back: no unit status change, no allocation, no audit row is left behind.</li>
        </ul>
      </Card>
    </>
  );
}
