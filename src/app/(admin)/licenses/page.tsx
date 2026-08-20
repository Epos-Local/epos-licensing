import Link from "next/link";

import { Notice, readNotice } from "~/app/_components/notice";
import {
  describeExpiry,
  effectiveLicenseState,
  formatDate,
} from "~/app/_lib/format";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/**
 * Every license, ordered by how close it is to needing attention.
 *
 * A flat alphabetical ledger would be a lookup tool; the operator's actual
 * question on opening this page is which of these is about to cause a support
 * call. Blocked and expired licenses sort first, then the soonest to expire, so
 * the top of the table is the work and the bottom is the archive.
 */
export default async function LicensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { notice, tone } = readNotice(await searchParams);

  const licenses = await db.license.findMany({
    orderBy: { validUntil: "asc" },
    include: {
      shop: { include: { customer: true } },
      devices: true,
    },
  });

  const now = new Date();
  const ranked = licenses
    .map((license) => ({
      license,
      state: effectiveLicenseState(license, now),
      approved: license.devices.filter((d) => d.status === "approved").length,
      pending: license.devices.filter((d) => d.status === "pending").length,
    }))
    .sort((a, b) => rank(a.state) - rank(b.state));

  const attention = ranked.filter((row) => row.state !== "active").length;

  return (
    <>
      <section className="vbg-section">
        <h1 className="vbg-title">Licenses</h1>

        <p className="vbg-lede vbg-span-7">
          {licenses.length === 0
            ? "No licenses have been issued yet."
            : attention === 0
              ? `${licenses.length} ${licenses.length === 1 ? "license" : "licenses"} issued, all active.`
              : `${licenses.length} issued. ${attention} ${attention === 1 ? "needs" : "need"} attention, listed first.`}
        </p>

        <div className="vbg-custom-actions">
          <Link href="/licenses/new" className="vbg-button">
            Issue a license
          </Link>
        </div>

        <Notice notice={notice} tone={tone} />
      </section>

      {licenses.length > 0 && (
        <section className="vbg-section">
          <div className="vbg-table-wrap vbg-span-12">
            <table>
              <caption className="vbg-visually-hidden">
                Issued licenses, those needing attention first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Shop</th>
                  <th scope="col">Key</th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Devices
                  </th>
                  <th scope="col">Expires</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ license, state, approved, pending }) => (
                  <tr key={license.id}>
                    <td>
                      <Link href={`/licenses/${license.id}`}>
                        {license.shop.name}
                      </Link>
                      {license.shop.customer?.name &&
                        license.shop.customer.name !== license.shop.name && (
                          <>
                            <br />
                            <span className="vbg-meta">
                              {license.shop.customer.name}
                            </span>
                          </>
                        )}
                    </td>
                    <td className="vbg-mono">{license.key}</td>
                    <td>
                      <span className="vbg-custom-status" data-state={state}>
                        {state}
                      </span>
                    </td>
                    <td className="vbg-numeric" style={{ textAlign: "right" }}>
                      {approved}/{license.maxDevices}
                      {pending > 0 ? ` (${pending} waiting)` : ""}
                    </td>
                    <td>
                      {formatDate(license.validUntil)}
                      <br />
                      <span className="vbg-meta">
                        {describeExpiry(license.validUntil, now)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function rank(state: string): number {
  if (state === "blocked") return 0;
  if (state === "expired") return 1;
  return 2;
}
