import Link from "next/link";
import { notFound } from "next/navigation";

import { Notice, readNotice } from "~/app/_components/notice";
import { updateCustomerAction } from "~/server/actions/customers";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { notice, tone } = readNotice(await searchParams);

  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  return (
    <section className="vbg-section">
      <p className="vbg-meta">
        <Link href={`/shops/${customer.id}`}>{customer.name ?? "(unnamed)"}</Link>
      </p>
      <h1 className="vbg-title">Edit customer</h1>

      <Notice notice={notice} tone={tone} />

      <form action={updateCustomerAction} className="vbg-span-7">
        <input type="hidden" name="id" value={customer.id} />

        <div className="vbg-custom-form-row">
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="name">
              Customer name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={customer.name ?? ""}
              required
            />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={customer.email ?? ""}
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
    </section>
  );
}
