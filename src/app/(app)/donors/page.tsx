import Link from "next/link";
import { DonationForm } from "@/components/DonationForm";
import { Badge, Card, EmptyState, PageHeader, Pagination, TableWrap, Td, Th } from "@/components/ui";
import { fmtDate, groupLabel } from "@/lib/format";
import { requirePageActor } from "@/server/guard";
import { listDonors } from "@/services/donations";

export const metadata = { title: "Donors — BloodLink" };

const GROUPS = ["A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG"];
const inputClass = "rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700";

export default async function DonorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePageActor(["ADMIN", "BANK_STAFF"]);
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && value !== "") flat[key] = value;

  const page = Math.max(1, Number(flat.page ?? 1) || 1);
  const eligibility = flat.eligibility === "eligible" || flat.eligibility === "ineligible" ? flat.eligibility : undefined;

  const [result, allDonors] = await Promise.all([
    listDonors(actor, {
      q: flat.q, bloodGroup: flat.bloodGroup, eligibility, page, pageSize: 20,
    }),
    listDonors(actor, { page: 1, pageSize: 100 }),
  ]);

  return (
    <>
      <PageHeader
        title="Donors and donations"
        description="Eligibility is evaluated from date of birth, weight, last donation and today's donations."
      />

      <Card title="Record a donation" description="A completed donation immediately creates one red-cell unit with a 35-day shelf life.">
        <DonationForm
          donors={allDonors.rows.map((donor) => ({
            id: donor.id,
            fullName: donor.fullName,
            bloodGroup: donor.bloodGroup,
            eligible: donor.eligible,
            reasons: donor.ineligibleReasons,
          }))}
        />
      </Card>

      <Card>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="q" className="block text-xs font-medium text-slate-600">Name or phone</label>
            <input id="q" name="q" defaultValue={flat.q ?? ""} className={inputClass} placeholder="Rahim" />
          </div>
          <div>
            <label htmlFor="bloodGroup" className="block text-xs font-medium text-slate-600">Group</label>
            <select id="bloodGroup" name="bloodGroup" defaultValue={flat.bloodGroup ?? ""} className={inputClass}>
              <option value="">All</option>
              {GROUPS.map((group) => <option key={group} value={group}>{groupLabel(group)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="eligibility" className="block text-xs font-medium text-slate-600">Eligibility</label>
            <select id="eligibility" name="eligibility" defaultValue={flat.eligibility ?? ""} className={inputClass}>
              <option value="">All</option>
              <option value="eligible">Eligible</option>
              <option value="ineligible">Ineligible</option>
            </select>
          </div>
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">Apply</button>
          <Link href="/donors" className="px-2 py-2 text-sm text-slate-600 underline">Reset</Link>
        </form>

        {result.rows.length === 0 ? (
          <EmptyState>No donors match these filters.</EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Donor</Th>
                <Th>Group</Th>
                <Th>Phone</Th>
                <Th>Age</Th>
                <Th className="text-right">Weight</Th>
                <Th>Last donation</Th>
                <Th className="text-right">Donations</Th>
                <Th>Eligibility</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((donor) => (
                <tr key={donor.id} className="hover:bg-slate-50">
                  <Td className="font-medium">{donor.fullName}</Td>
                  <Td className="font-semibold">{groupLabel(donor.bloodGroup)}</Td>
                  <Td className="text-slate-600">{donor.phone}</Td>
                  <Td className="tabular-nums">{new Date().getUTCFullYear() - donor.dob.getUTCFullYear()}</Td>
                  <Td className="text-right tabular-nums">{donor.weightKg} kg</Td>
                  <Td className="text-slate-600">{donor.lastDonationAt ? fmtDate(donor.lastDonationAt) : "Never"}</Td>
                  <Td className="text-right tabular-nums">{donor.donations}</Td>
                  <Td>
                    {donor.eligible ? (
                      <Badge tone="success">Eligible</Badge>
                    ) : (
                      <div className="max-w-xs">
                        <Badge tone="danger">Ineligible</Badge>
                        <p className="mt-1 text-xs text-slate-600">{donor.ineligibleReasons.join(" ")}</p>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        <div className="mt-3">
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} basePath="/donors" params={flat} />
        </div>
      </Card>
    </>
  );
}
