import { db } from "~/server/db";

import { signUpdate } from "./signing";

/**
 * The update announcement carried on every licensing response, in the
 * PascalCase shape `Pos.Core.Domain.LicenseServerResponse` binds against.
 *
 * `UpdateSha256` is empty rather than absent when unknown, because it is inside
 * the signature and both ends have to agree on how to serialize "no hash" — see
 * `canonicalUpdatePayload`.
 */
export interface UpdateAnnouncement {
  UpdateVersion: string;
  UpdateMinimumVersion: string;
  UpdateUrl: string;
  UpdateSha256: string;
  UpdateSignature: string;
}

/**
 * The newest published release, signed, or null when nothing is published.
 *
 * Read fresh on every request, deliberately. An earlier version cached this for
 * a minute, which is the sort of optimisation that looks free and is not: the
 * cache lives in one process, so publishing a release cleared it only on
 * whichever serverless instance served the admin's click while every other warm
 * instance carried on announcing the old answer. Publishing a build — and
 * especially withdrawing a bad one — has to take effect everywhere at once, and
 * the cost of that guarantee is a single indexed row read on a request that
 * already does several.
 *
 * Ordered by `publishedAt` rather than `version`: comparing dotted version
 * strings in SQL sorts "0.10.0" before "0.9.0", and "which release is current"
 * is a decision an operator made, not a string comparison.
 */
export async function currentUpdateAnnouncement(): Promise<UpdateAnnouncement | null> {
  const release = await db.appRelease.findFirst({
    where: { isPublished: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      version: true,
      minimumVersion: true,
      downloadUrl: true,
      sha256: true,
    },
  });

  if (!release) return null;

  return {
    UpdateVersion: release.version,
    UpdateMinimumVersion: release.minimumVersion,
    UpdateUrl: release.downloadUrl,
    UpdateSha256: release.sha256 ?? "",
    UpdateSignature: signUpdate(release),
  };
}
