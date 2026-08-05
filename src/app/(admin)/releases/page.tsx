import { Notice, readNotice } from "~/app/_components/notice";
import { formatDateTime } from "~/app/_lib/format";
import {
  createReleaseAction,
  publishReleaseAction,
  unpublishReleaseAction,
} from "~/server/actions/releases";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/**
 * Publishing builds of the till software.
 *
 * Two controls, matching the only two decisions there are: which build is
 * available, and whether shops below it may keep trading. Everything else —
 * the stored floor, the signature the tills verify — is derived. See
 * `AppRelease` in schema.prisma for why the floor is stored rather than a
 * per-release mandatory flag.
 */
export default async function ReleasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { notice, tone } = readNotice(await searchParams);

  const releases = await db.appRelease.findMany({
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  const live = releases.find((release) => release.isPublished);

  return (
    <>
      <section className="vbg-section">
        <h1 className="vbg-title">Releases</h1>
        <p className="vbg-lede vbg-span-7">
          What every till is offered on its next check-in, and whether an old
          one may keep taking payment.
        </p>
        <Notice notice={notice} tone={tone} />
      </section>

      <section className="vbg-section">
        <h2 className="vbg-heading-24">Currently offered</h2>
        {live ? (
          <p className="vbg-span-7">
            Tills running below <strong>{live.version}</strong> are shown the
            update banner. Tills below <strong>{live.minimumVersion}</strong>{" "}
            cannot take payment until they upgrade.
            {live.sha256
              ? " The installer is verified by hash before it runs."
              : " No hash was given, so tills will open the download link rather than installing it themselves."}
          </p>
        ) : (
          <p className="vbg-span-7">
            Nothing is published. No till is being offered an update.
          </p>
        )}
      </section>

      <section className="vbg-section">
        <h2 className="vbg-heading-24">Add a release</h2>

        <form action={createReleaseAction} className="vbg-span-7">
          <div className="vbg-custom-form-row">
            <div className="vbg-field">
              <label className="vbg-label" htmlFor="version">
                Version
              </label>
              <input
                id="version"
                name="version"
                type="text"
                placeholder="0.4.0"
                required
              />
            </div>
            <div className="vbg-field">
              <label className="vbg-label" htmlFor="updateType">
                Update type
              </label>
              <select id="updateType" name="updateType" defaultValue="soft">
                <option value="soft">Optional — show the banner only</option>
                <option value="hard">
                  Required — block checkout below this version
                </option>
              </select>
            </div>
          </div>

          <div className="vbg-field" style={{ marginTop: "var(--vbg-space-4)" }}>
            <label className="vbg-label" htmlFor="downloadUrl">
              Installer link (https)
            </label>
            <input
              id="downloadUrl"
              name="downloadUrl"
              type="url"
              placeholder="https://.../EPos365-Setup.exe"
              required
            />
          </div>

          <div className="vbg-field" style={{ marginTop: "var(--vbg-space-4)" }}>
            <label className="vbg-label" htmlFor="sha256">
              Installer SHA-256
            </label>
            <input
              id="sha256"
              name="sha256"
              type="text"
              placeholder="64 hex characters"
              maxLength={64}
            />
            <p className="vbg-lede">
              Run <code>Get-FileHash EPos365-Setup.exe</code> and paste the
              hash. Without it a till will open the link instead of installing
              on its own — it will not execute a download it cannot verify.
            </p>
          </div>

          <div className="vbg-field" style={{ marginTop: "var(--vbg-space-4)" }}>
            <label className="vbg-label" htmlFor="notes">
              What&rsquo;s new (shown on the till)
            </label>
            <input id="notes" name="notes" type="text" maxLength={500} />
          </div>

          <div
            className="vbg-custom-actions"
            style={{ marginTop: "var(--vbg-space-6)" }}
          >
            <button type="submit" className="vbg-button">
              Save release
            </button>
          </div>
        </form>
      </section>

      {releases.length > 0 && (
        <section className="vbg-section">
          <h2 className="vbg-heading-24">All releases</h2>

          <div className="vbg-table-wrap vbg-span-12">
            <table>
              <caption className="vbg-visually-hidden">
                Every release, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Blocks below</th>
                  <th scope="col">Installer</th>
                  <th scope="col">Verified</th>
                  <th scope="col">Published</th>
                  <th scope="col">
                    <span className="vbg-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {releases.map((release) => (
                  <tr key={release.id}>
                    <td>
                      <strong>{release.version}</strong>
                      {release.notes ? <div>{release.notes}</div> : null}
                    </td>
                    <td>{release.minimumVersion}</td>
                    <td>
                      <a
                        href={release.downloadUrl}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        Installer
                      </a>
                    </td>
                    <td>{release.sha256 ? "Hash on file" : "No hash"}</td>
                    <td>
                      {release.isPublished
                        ? formatDateTime(release.publishedAt)
                        : "Not published"}
                    </td>
                    <td>
                      <form
                        action={
                          release.isPublished
                            ? unpublishReleaseAction
                            : publishReleaseAction
                        }
                      >
                        <input
                          type="hidden"
                          name="releaseId"
                          value={release.id}
                        />
                        <button type="submit" className="vbg-button">
                          {release.isPublished ? "Withdraw" : "Publish"}
                        </button>
                      </form>
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
