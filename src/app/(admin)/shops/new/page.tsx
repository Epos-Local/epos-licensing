import Link from "next/link";

import { Notice, readNotice } from "~/app/_components/notice";
import { createCustomerAction } from "~/server/actions/customers";

export const dynamic = "force-dynamic";

/**
 * Creating a customer always creates one Shop alongside it. Shop name
 * defaults to the customer's own name when left blank — most customers only
 * ever need the one, and it's editable afterward from the customer's detail
 * page regardless.
 */
export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { notice, tone } = readNotice(await searchParams);

  return (
    <section className="vbg-section">
      <p className="vbg-meta">
        <Link href="/shops">Customers</Link>
      </p>
      <h1 className="vbg-title">Add a customer</h1>

      <Notice notice={notice} tone={tone} />

      <form action={createCustomerAction} className="vbg-span-7">
        <div className="vbg-custom-form-row">
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="name">
              Customer name
            </label>
            <input id="name" name="name" type="text" required />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="shopName">
              Shop name
            </label>
            <input
              id="shopName"
              name="shopName"
              type="text"
              placeholder="Same as customer name"
            />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" />
            <p className="vbg-helper">
              Needed later if this customer ever gets a login — optional now.
            </p>
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="phone">
              Phone
            </label>
            <input id="phone" name="phone" type="tel" />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="notes">
              Note
            </label>
            <input id="notes" name="notes" type="text" maxLength={500} />
          </div>
        </div>

        <div
          className="vbg-custom-actions"
          style={{ marginTop: "var(--vbg-space-6)" }}
        >
          <button type="submit" className="vbg-button">
            Add customer
          </button>
        </div>
      </form>
    </section>
  );
}
