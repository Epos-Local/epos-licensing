import Link from "next/link";

import { Notice, readNotice } from "~/app/_components/notice";
import { deviceLocation, formatDateTime, shortId } from "~/app/_lib/format";
import {
  approveDeviceAction,
  rejectDeviceAction,
} from "~/server/actions/devices";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/**
 * The pending approval queue, and the panel's landing page.
 *
 * This is the one thing in the whole system that cannot be automated: a device
 * that is under its license's limit but checking in from somewhere the license
 * has never been seen. Everything else the server decides on its own, so this
 * queue is the operator's actual job and gets the first viewport.
 *
 * Each row carries the comparison the decision turns on, rather than making the
 * operator open the license to reconstruct it: where this device is, against
 * where the license's approved devices already are. A device that appears two
 * streets away is a second till; one that appears two counties away is the
 * copied-database case this whole mechanism exists to catch.
 */
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { notice, tone } = readNotice(await searchParams);

  const pending = await db.device.findMany({
    where: { status: "pending" },
    orderBy: { firstSeenAt: "desc" },
    include: {
      license: {
        include: {
          shop: true,
          devices: {
            where: { status: "approved" },
            orderBy: { isBaseline: "desc" },
          },
        },
      },
    },
  });

  return (
    <>
      <section className="vbg-section">
        <h1 className="vbg-title">
          {pending.length === 0
            ? "Nothing is waiting on a decision"
            : pending.length === 1
              ? "One device is waiting on a decision"
              : `${pending.length} devices are waiting on a decision`}
        </h1>

        <p className="vbg-lede vbg-span-7">
          A device lands here when its license still has a free slot but the
          request came from outside the locations that license has already been
          approved at. Approving says this is another till at the same business.
        </p>

        <Notice notice={notice} tone={tone} />
      </section>

      {pending.length === 0 ? (
        <section className="vbg-section">
          <p className="vbg-reading">
            Devices that match a license&rsquo;s established location are
            approved automatically and never appear here, and a device beyond
            its license&rsquo;s limit is refused outright rather than queued. An
            empty queue is the normal state.
          </p>
          <p className="vbg-reading">
            <Link href="/audit">The audit log</Link> records what the server
            decided on its own.
          </p>
        </section>
      ) : (
        <section className="vbg-section">
          <div className="vbg-table-wrap vbg-span-12">
            <table>
              <caption className="vbg-visually-hidden">
                Devices awaiting manual approval, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Device</th>
                  <th scope="col">Requesting from</th>
                  <th scope="col">License already approved at</th>
                  <th scope="col">First seen</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((device) => {
                  const approved = device.license.devices;

                  return (
                    <tr key={device.id}>
                      <td>
                        <Link href={`/licenses/${device.licenseId}`}>
                          {device.license.shop.name}
                        </Link>
                        <br />
                        <span className="vbg-mono vbg-meta">
                          {device.license.key}
                        </span>
                      </td>
                      <td>
                        <span className="vbg-mono">
                          {shortId(device.deviceId)}
                        </span>
                      </td>
                      <td>
                        {deviceLocation(device)}
                        <br />
                        <span className="vbg-mono vbg-meta">
                          {device.lastKnownIp ?? "no IP recorded"}
                        </span>
                      </td>
                      <td>
                        {approved.length === 0
                          ? "no approved device"
                          : approved.map((peer) => (
                              <span key={peer.id}>
                                {deviceLocation(peer)}
                                <br />
                                <span className="vbg-mono vbg-meta">
                                  {peer.lastKnownIp ?? "no IP recorded"}
                                </span>
                              </span>
                            ))}
                      </td>
                      <td>{formatDateTime(device.firstSeenAt)}</td>
                      <td>
                        <div className="vbg-custom-actions">
                          <form action={approveDeviceAction}>
                            <input
                              type="hidden"
                              name="deviceRowId"
                              value={device.id}
                            />
                            <input type="hidden" name="returnTo" value="/" />
                            <button type="submit" className="vbg-button">
                              Approve
                            </button>
                          </form>
                          <form action={rejectDeviceAction}>
                            <input
                              type="hidden"
                              name="deviceRowId"
                              value={device.id}
                            />
                            <input type="hidden" name="returnTo" value="/" />
                            <button
                              type="submit"
                              className="vbg-custom-link-action"
                              data-tone="destructive"
                            >
                              Reject
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="vbg-caption">
            Location comes from the edge network&rsquo;s reading of the
            request&rsquo;s source IP. It is a strong signal and not a proof: a
            VPN or a mobile hotspot can put a legitimate till in the wrong
            place, which is why this decision is a person&rsquo;s and not the
            server&rsquo;s.
          </p>
        </section>
      )}
    </>
  );
}
