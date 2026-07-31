import Link from "next/link";

import { formatDateTime } from "~/app/_lib/format";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/**
 * The append-only record of everything the server and the operator did.
 *
 * Read-only by construction: nothing in the application updates or deletes an
 * audit row, which is what makes it usable as an answer to "what happened to
 * this license" months later.
 *
 * Rendered as a feed rather than a table because each row is one sentence and
 * the reader scans down them; a five-column table of mostly-empty cells would
 * be harder to read and no more precise.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { license: { include: { shop: true } } },
    }),
    db.auditEvent.count(),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <section className="vbg-section">
        <h1 className="vbg-title">Audit log</h1>
        <p className="vbg-lede vbg-span-7">
          Every activation, check-in, approval and edit, newest first. Nothing
          here can be changed or removed.
        </p>
      </section>

      <section className="vbg-section">
        {events.length === 0 ? (
          <p className="vbg-reading">
            Nothing has been recorded yet. Rows appear the moment a till
            activates or an edit is made.
          </p>
        ) : (
          <>
            <ul className="vbg-custom-feed vbg-span-12">
              {events.map((event) => (
                <li key={event.id} className="vbg-custom-feed-item">
                  <span className="vbg-mono vbg-meta">
                    {formatDateTime(event.createdAt)}
                  </span>
                  <span>
                    {event.summary}
                    <br />
                    <span className="vbg-custom-feed-detail">
                      {event.license ? (
                        <>
                          <Link href={`/licenses/${event.licenseId}`}>
                            {event.license.shop.name}
                          </Link>
                          {" · "}
                        </>
                      ) : null}
                      {event.actor}
                      {event.geo ? ` · ${event.geo}` : ""}
                      {event.ip ? ` · ${event.ip}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {lastPage > 1 && (
              <p className="vbg-caption">
                Page {page} of {lastPage}.{" "}
                {page > 1 && (
                  <Link href={`/audit?page=${page - 1}`}>Newer</Link>
                )}
                {page > 1 && page < lastPage ? " · " : ""}
                {page < lastPage && (
                  <Link href={`/audit?page=${page + 1}`}>Older</Link>
                )}
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
