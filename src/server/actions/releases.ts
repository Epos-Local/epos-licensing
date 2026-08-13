"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuditEventType } from "generated/prisma";
import { db } from "~/server/db";

import { formValue, redirectWithNotice, requireAdmin } from "./shared";

/**
 * Publishing a build of the WPF client.
 *
 * The form asks the two questions an operator actually has — "what version, and
 * is it optional?" — and derives the stored floor from the answer, rather than
 * making them reason about `minimumVersion` directly. See the schema comment on
 * `AppRelease.minimumVersion` for why the floor is stored instead of a per-row
 * mandatory flag.
 */
const VERSION = /^\d+\.\d+(\.\d+)?(\.\d+)?$/;

const releaseSchema = z.object({
  version: z
    .string()
    .trim()
    .regex(VERSION, "Version must look like 0.4.0, matching the installer."),
  downloadUrl: z
    .string()
    .trim()
    .url("That download link is not a valid URL.")
    .refine(
      (url) => url.startsWith("https://"),
      "The download link must be https — the till will not run anything fetched over plain http.",
    ),
  // 64 lowercase hex characters. Optional, but the till will only auto-install
  // when it can verify what it downloaded — see the schema comment on sha256.
  sha256: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{64}$/, "A SHA-256 is 64 hex characters.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(500).optional(),
  mandatory: z.boolean(),
}).superRefine((data, ctx) => {
  // A hash names one exact sequence of bytes; a mutable path names whatever is there today. The
  // two together are a contradiction that only shows up later, on a till, as a failed install —
  // the moment the next release overwrites `latest/`, this release's hash describes a file that no
  // longer exists and every till still on this announcement refuses the download.
  //
  // Same reasoning as never pinning a digest to a Docker `:latest` tag. The versioned path this
  // workflow also writes is immutable, so it is the only correct target for a verified install.
  if (data.sha256 && /\/latest\//i.test(data.downloadUrl)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["downloadUrl"],
      message:
        "Point a verified release at its versioned path (…/releases/v1.4.0/EPos365-Setup.exe), not …/latest/. " +
        "The next release overwrites latest/, which would break this release's hash and stop tills installing. " +
        "Publish without a hash if you really want latest/ — tills will open the link in a browser instead.",
    });
  }
});

export async function createReleaseAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const parsed = releaseSchema.safeParse({
    version: formValue(formData, "version"),
    downloadUrl: formValue(formData, "downloadUrl"),
    sha256: formValue(formData, "sha256"),
    notes: formValue(formData, "notes"),
    mandatory: formValue(formData, "updateType") === "hard",
  });

  if (!parsed.success) {
    redirectWithNotice(
      "/releases",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }

  // A soft release inherits the floor already in force. It must never lower it:
  // shops below the existing floor are blocked for a reason that publishing an
  // optional update afterwards does not undo.
  const currentFloor = await highestPublishedFloor();
  const minimumVersion = parsed.data.mandatory
    ? parsed.data.version
    : currentFloor;

  if (parsed.data.mandatory && compareVersions(parsed.data.version, currentFloor) < 0) {
    redirectWithNotice(
      "/releases",
      `Version ${parsed.data.version} is older than the floor already in force (${currentFloor}). Publishing it as required would unblock tills that are currently held back.`,
    );
  }

  const release = await db.appRelease.create({
    data: {
      version: parsed.data.version,
      minimumVersion,
      downloadUrl: parsed.data.downloadUrl,
      sha256: parsed.data.sha256 ?? null,
      notes: parsed.data.notes ?? null,
      isPublished: false,
    },
  });

  await db.auditEvent.create({
    data: {
      type: AuditEventType.release_published,
      actor,
      summary: `Release ${release.version} added (floor ${minimumVersion}, ${parsed.data.mandatory ? "required" : "optional"}) — not yet published`,
      meta: { releaseId: release.id, downloadUrl: release.downloadUrl },
    },
  });

  revalidatePath("/releases");
  redirectWithNotice(
    "/releases",
    `Release ${release.version} saved. Publish it when you are ready for tills to see it.`,
    "success",
  );
}

export async function publishReleaseAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = formValue(formData, "releaseId");

  const release = await db.appRelease.findUnique({ where: { id } });
  if (!release) redirectWithNotice("/releases", "That release no longer exists.");

  await db.appRelease.update({
    where: { id },
    data: { isPublished: true, publishedAt: new Date() },
  });

  await db.auditEvent.create({
    data: {
      type: AuditEventType.release_published,
      actor,
      summary: `Release ${release.version} published to all tills (floor ${release.minimumVersion})`,
      meta: { releaseId: release.id },
    },
  });

  revalidatePath("/releases");
  redirectWithNotice(
    "/releases",
    `Release ${release.version} is live. Tills will see it on their next check-in.`,
    "success",
  );
}

export async function unpublishReleaseAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = formValue(formData, "releaseId");

  const release = await db.appRelease.findUnique({ where: { id } });
  if (!release) redirectWithNotice("/releases", "That release no longer exists.");

  await db.appRelease.update({ where: { id }, data: { isPublished: false } });

  await db.auditEvent.create({
    data: {
      type: AuditEventType.release_unpublished,
      actor,
      summary: `Release ${release.version} withdrawn`,
      meta: { releaseId: release.id },
    },
  });

  revalidatePath("/releases");
  redirectWithNotice(
    "/releases",
    `Release ${release.version} withdrawn. Tills fall back to the previous published release.`,
    "success",
  );
}

/** The highest floor any published release imposes; "0.0.0" if none do. */
async function highestPublishedFloor(): Promise<string> {
  const published = await db.appRelease.findMany({
    where: { isPublished: true },
    select: { minimumVersion: true },
  });

  return published.reduce(
    (highest, row) =>
      compareVersions(row.minimumVersion, highest) > 0
        ? row.minimumVersion
        : highest,
    "0.0.0",
  );
}

/**
 * Numeric, part by part — the same comparison the client performs.
 *
 * String comparison is wrong here in a way that bites exactly once and badly:
 * "0.10.0" sorts below "0.9.0", so the tenth release of a line would silently
 * stop being offered.
 */
function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}
