import Link from "next/link";
import { notFound } from "next/navigation";

import { Notice, readNotice } from "~/app/_components/notice";
import { updateShopAction } from "~/server/actions/shops";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

export default async function EditShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; shopId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, shopId } = await params;
  const { notice, tone } = readNotice(await searchParams);

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    include: { licenses: true },
  });
  if (shop?.customerId !== id) notFound();

  return (
    <section className="vbg-section">
      <p className="vbg-meta">
        <Link href={`/shops/${id}`}>Back to customer</Link>
      </p>
      <h1 className="vbg-title">Edit shop</h1>

      <Notice notice={notice} tone={tone} />

      <form action={updateShopAction} className="vbg-span-7">
        <input type="hidden" name="id" value={shop.id} />
        <input type="hidden" name="customerId" value={id} />

        <div className="vbg-custom-form-row">
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="name">
              Shop name
            </label>
            <input id="name" name="name" type="text" defaultValue={shop.name} required />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" defaultValue={shop.email ?? ""} />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="phone">
              Phone
            </label>
            <input id="phone" name="phone" type="tel" defaultValue={shop.phone ?? ""} />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="notes">
              Note
            </label>
            <input
              id="notes"
              name="notes"
              type="text"
              maxLength={500}
              defaultValue={shop.notes ?? ""}
            />
          </div>
        </div>

        <div
          className="vbg-custom-actions"
          style={{ marginTop: "var(--vbg-space-6)" }}
        >
          <button type="submit" className="vbg-button">
            Save
          </button>
        </div>
      </form>

      <div className="vbg-span-7" style={{ marginTop: "var(--vbg-space-8)" }}>
        <h2 className="vbg-heading-24">Licenses</h2>
        {shop.licenses.length === 0 ? (
          <p className="vbg-reading">No license issued to this shop yet.</p>
        ) : (
          <ul className="vbg-custom-feed">
            {shop.licenses.map((license) => (
              <li key={license.id} className="vbg-custom-feed-item">
                <Link href={`/licenses/${license.id}`} className="vbg-mono">
                  {license.key}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
