import { Notice, readNotice } from "~/app/_components/notice";
import { formatDate } from "~/app/_lib/format";
import {
  createAdminAction,
  deleteAdminAction,
  setAdminPasswordAction,
} from "~/server/actions/admins";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/**
 * Who can sign in to this panel.
 *
 * Accounts live in the database and are managed here. The environment's
 * ADMIN_EMAIL and ADMIN_PASSWORD only ever bootstrap the first one, and can be
 * removed from the environment once somebody exists, because nothing reads them
 * at runtime.
 */
export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { notice, tone } = readNotice(await searchParams);
  const session = await auth();

  const admins = await db.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <>
      <section className="vbg-section">
        <h1 className="vbg-title">Administrators</h1>
        <p className="vbg-lede vbg-span-7">
          {admins.length === 1
            ? "One account can sign in to this panel."
            : `${admins.length} accounts can sign in to this panel.`}{" "}
          Every one of them can issue licenses, approve devices and generate
          license files.
        </p>
        <Notice notice={notice} tone={tone} />
      </section>

      <section className="vbg-section">
        <h2 className="vbg-heading-24">On file</h2>

        <div className="vbg-table-wrap vbg-span-12">
          <table>
            <caption className="vbg-visually-hidden">
              Accounts with access to this panel
            </caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Name</th>
                <th scope="col">Added</th>
                <th scope="col">Set a new password</th>
                <th scope="col">
                  <span className="vbg-visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => {
                const isSelf = admin.email === session?.user?.email;

                return (
                  <tr key={admin.id}>
                    <td>
                      {admin.email}
                      {isSelf && (
                        <>
                          <br />
                          <span className="vbg-meta">signed in as this</span>
                        </>
                      )}
                    </td>
                    <td>
                      {admin.name ?? <span className="vbg-meta">not set</span>}
                    </td>
                    <td>{formatDate(admin.createdAt)}</td>
                    <td>
                      <form action={setAdminPasswordAction}>
                        <input type="hidden" name="id" value={admin.id} />
                        <div className="vbg-custom-actions">
                          <input
                            type="password"
                            name="password"
                            required
                            minLength={12}
                            autoComplete="new-password"
                            placeholder="New password"
                            aria-label={`New password for ${admin.email}`}
                          />
                          <button
                            type="submit"
                            className="vbg-custom-link-action"
                          >
                            Set
                          </button>
                        </div>
                      </form>
                    </td>
                    <td>
                      {isSelf ? (
                        <span className="vbg-meta">&mdash;</span>
                      ) : (
                        <form action={deleteAdminAction}>
                          <input type="hidden" name="id" value={admin.id} />
                          <button
                            type="submit"
                            className="vbg-custom-link-action"
                            data-tone="destructive"
                          >
                            Remove
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="vbg-caption">
          You cannot remove your own account, which is what guarantees one
          always remains. Ask a colleague to remove yours.
        </p>
      </section>

      <section className="vbg-section">
        <h2 className="vbg-heading-24">Add an administrator</h2>
        <p className="vbg-reading vbg-span-7">
          There is no invitation email and no self-service sign-up, because
          anyone who can create an account here can mint licenses. Set the
          password yourself and pass it on out of band; they can change it from
          this page once they are in.
        </p>

        <form action={createAdminAction} className="vbg-span-7">
          <div className="vbg-custom-form-row">
            <div className="vbg-field">
              <label className="vbg-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="off"
                required
              />
            </div>

            <div className="vbg-field">
              <label className="vbg-label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" type="text" maxLength={120} />
              <p className="vbg-helper">
                Optional. Shown here and nowhere else.
              </p>
            </div>

            <div className="vbg-field">
              <label className="vbg-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
              <p className="vbg-helper">At least 12 characters.</p>
            </div>
          </div>

          <div
            className="vbg-custom-actions"
            style={{ marginTop: "var(--vbg-space-6)" }}
          >
            <button type="submit" className="vbg-button">
              Add administrator
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
