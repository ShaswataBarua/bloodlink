import { ProfileForm } from "@/components/ProfileForm";
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from "@/components/ui";
import { fmtDate, fmtDateTime, groupLabel } from "@/lib/format";
import { requirePageActor } from "@/server/guard";
import { getDonor } from "@/services/donations";

export const metadata = { title: "My profile — BloodLink" };

export default async function ProfilePage() {
  const actor = await requirePageActor();

  if (actor.role !== "DONOR" || !actor.donorId) {
    return (
      <>
        <PageHeader title="My profile" description="Account details. Role and tenant fields are administrator-controlled." />
        <Card title="Account">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Name</dt><dd className="mt-0.5 font-medium">{actor.name}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt><dd className="mt-0.5">{actor.email}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Role</dt><dd className="mt-0.5">{actor.role}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Hospital</dt><dd className="mt-0.5">{actor.hospitalId ? "Linked" : "—"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Blood bank</dt><dd className="mt-0.5">{actor.bankId ? "Linked" : "—"}</dd></div>
          </dl>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <ProfileForm initialName={actor.name} />
          </div>
        </Card>
      </>
    );
  }

  const donor = await getDonor(actor, actor.donorId);

  return (
    <>
      <PageHeader title="My donor profile" description="Your eligibility is calculated live from the donation rules." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Donor record">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Name</dt><dd className="mt-0.5 font-medium">{donor.fullName}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Blood group</dt><dd className="mt-0.5 font-semibold">{groupLabel(donor.bloodGroup)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Phone</dt><dd className="mt-0.5">{donor.phone}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Weight</dt><dd className="mt-0.5">{donor.weightKg} kg</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Date of birth</dt><dd className="mt-0.5">{fmtDate(donor.dob)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Last donation</dt><dd className="mt-0.5">{donor.lastDonationAt ? fmtDate(donor.lastDonationAt) : "Never"}</dd></div>
          </dl>
        </Card>

        <Card title="Eligibility">
          {donor.eligible ? (
            <div>
              <Badge tone="success">Eligible to donate</Badge>
              <p className="mt-2 text-sm text-slate-600">
                You meet the age, weight and 90-day interval rules. Visit a participating blood bank.
              </p>
            </div>
          ) : (
            <div>
              <Badge tone="danger">Not eligible right now</Badge>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {donor.ineligibleReasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <Card title="Donation history" description="Every donation recorded by a blood bank for this donor.">
        {donor.history.length === 0 ? (
          <EmptyState>No donations recorded yet.</EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Bank</Th>
                <Th className="text-right">Volume</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {donor.history.map((donation) => (
                <tr key={donation.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(donation.collectedAt)}</Td>
                  <Td className="text-slate-600">{donation.bankName}</Td>
                  <Td className="text-right tabular-nums">{donation.volumeMl} ml</Td>
                  <Td>{donation.status}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
