import Link from "next/link";

import { Notice, readNotice } from "~/app/_components/notice";
import { createShopAction, updateShopAction } from "~/server/actions/shops";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/**
 * Customers, in the minimal sense the design doc allows: enough to make a
 * license list readable and a support call possible, and nothing more. No
 * billing, no ticket history.
 *
 * Records are edited in place rather than behind a detail page, because there
 * are four fields and no customer will ever have enough of them to need a page
 * of their own.
 */
export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { notice, tone } = readNotice(await searchParams);

  const shops = await db.shop.findMany({
    orderBy: { name: "asc" },
    include: { licenses: true },
  });

  return (
    <>
      <section className="vbg-section">
        <h1 className="vbg-title">Customers</h1>
        <p className="vbg-lede vbg-span-7">
          Who holds which license, and who to ring when a till stops taking
          payment.
        </p>
        <Notice notice={notice} tone={tone} />
      </section>

      <section className="vbg-section">
        <h2 className="vbg-heading-24">Add a customer</h2>

        <form action={createShopAction} className="vbg-span-7">
          <div className="vbg-custom-form-row">
            <div className="vbg-field">
              <label className="vbg-label" htmlFor="name">
                Business name
              </label>
              <input id="name" name="name" type="text" required />
            </div>
            <div className="vbg-field">
              <label className="vbg-label" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" type="email" />
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

      {shops.length > 0 && (
        <section className="vbg-section">
          <h2 className="vbg-heading-24">On file</h2>

          <div className="vbg-table-wrap vbg-span-12">
            <table>
              <caption className="vbg-visually-hidden">
                Customers and the licenses they hold
              </caption>
              <thead>
                <tr>
                  <th scope="col">Business</th>
                  <th scope="col">Email</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Note</th>
                  <th scope="col">Licenses</th>
                  <th scope="col">
                    <span className="vbg-visually-hidden">Save</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <tr key={shop.id}>
                    <td>
                      <form action={updateShopAction} id={`shop-${shop.id}`} />
                      <input
                        form={`shop-${shop.id}`}
                        type="hidden"
                        name="id"
                        value={shop.id}
                      />
                      <input
                        form={`shop-${shop.id}`}
                        type="text"
                        name="name"
                        defaultValue={shop.name}
                        required
                        aria-label={`Business name for ${shop.name}`}
                      />
                    </td>
                    <td>
                      <input
                        form={`shop-${shop.id}`}
                        type="email"
                        name="email"
                        defaultValue={shop.email ?? ""}
                        aria-label={`Email for ${shop.name}`}
                      />
                    </td>
                    <td>
                      <input
                        form={`shop-${shop.id}`}
                        type="tel"
                        name="phone"
                        defaultValue={shop.phone ?? ""}
                        aria-label={`Phone for ${shop.name}`}
                      />
                    </td>
                    <td>
                      <input
                        form={`shop-${shop.id}`}
                        type="text"
                        name="notes"
                        defaultValue={shop.notes ?? ""}
                        maxLength={500}
                        aria-label={`Note for ${shop.name}`}
                      />
                    </td>
                    <td>
                      {shop.licenses.length === 0 ? (
                        <span className="vbg-meta">none</span>
                      ) : (
                        shop.licenses.map((license) => (
                          <span key={license.id}>
                            <Link
                              href={`/licenses/${license.id}`}
                              className="vbg-mono"
                            >
                              {license.key}
                            </Link>
                            <br />
                          </span>
                        ))
                      )}
                    </td>
                    <td>
                      <button
                        form={`shop-${shop.id}`}
                        type="submit"
                        className="vbg-custom-link-action"
                      >
                        Save
                      </button>
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
