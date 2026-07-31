import { AuditEventType, DeviceStatus } from "generated/prisma";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { normalizeDeviceId } from "~/server/licensing/license-key";
import { buildSignedBlob } from "~/server/licensing/service";
import { toLicenseFileJson } from "~/server/licensing/signing";

/**
 * Generates a `.lic` file for a device id typed in by support.
 *
 * This is the offline activation path from `LICENSE_FILE.md`, and it is the
 * only one that reaches the customers it was written for. A shop with no route
 * to this server never calls `/activate`, so its till never appears in the
 * device list, so the per-device download link on that list can never be shown
 * for it. The customer reads their device id off Settings > License, support
 * pastes it here, and the file comes back bound to it.
 *
 * POST rather than GET because an unknown device id is enrolled as approved,
 * which consumes a slot. Handing over a file grants exactly the access a live
 * activation would, so it has to be counted the same way; otherwise the device
 * cap could be walked straight past by issuing files instead of activating.
 *
 * The file is signed in memory and streamed. Nothing is written to disk, and no
 * copy is kept: regenerating is free, and a stored file would be a signed
 * credential sitting around for no reason.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Authentication required.", { status: 401 });
  }

  const { id } = await params;
  const back = (notice: string) =>
    Response.redirect(
      new URL(
        `/licenses/${id}?notice=${encodeURIComponent(notice)}&tone=error`,
        request.url,
      ),
      // 303 so the browser follows with GET rather than repeating the POST.
      303,
    );

  const form = await request.formData();
  const raw = form.get("deviceId");
  const deviceId = normalizeDeviceId(typeof raw === "string" ? raw : "");

  if (!deviceId) {
    return back(
      "That does not look like a device ID. It is 32 characters, shown on the till under Settings > License.",
    );
  }

  const license = await db.license.findUnique({
    where: { id },
    include: { shop: true },
  });
  if (!license) return back("That license no longer exists.");

  if (license.status === "blocked") {
    return back(
      "This license is blocked. Unblock it before issuing a license file.",
    );
  }

  const existing = await db.device.findUnique({
    where: { licenseId_deviceId: { licenseId: license.id, deviceId } },
  });

  // A device already on file keeps whatever verdict it has. Issuing a file to
  // one that is pending would grant precisely what the review queue withheld,
  // and would do it without leaving a decision behind, so it is refused and the
  // operator is sent to the queue to decide properly.
  if (existing && existing.status !== DeviceStatus.approved) {
    return back(
      `That device is ${existing.status} on this license. Approve it in the device list first.`,
    );
  }

  let device = existing;

  if (!device) {
    const approvedCount = await db.device.count({
      where: { licenseId: license.id, status: DeviceStatus.approved },
    });

    if (approvedCount >= license.maxDevices) {
      return back(
        `This license already has ${approvedCount} of ${license.maxDevices} devices approved. Deactivate one before issuing a file for another.`,
      );
    }

    const now = new Date();
    device = await db.device.create({
      data: {
        licenseId: license.id,
        deviceId,
        // No activation ever reached us, so there is no fingerprint to record.
        // Stated plainly rather than faked, since this column is an audit trail.
        hardwareFingerprint: "unknown (offline activation)",
        status: DeviceStatus.approved,
        // Location is unknown for an offline enrolment, so this device is a
        // poor baseline: a later online till compared against it matches
        // nothing and lands in the review queue, which is the safe direction.
        isBaseline: approvedCount === 0,
        approvedAt: now,
      },
    });

    await db.auditEvent.create({
      data: {
        type: AuditEventType.device_approved,
        licenseId: license.id,
        deviceId: device.id,
        actor: session.user.email,
        summary: `Device ${deviceId.slice(0, 12)}… enrolled and approved for offline activation by license file`,
      },
    });
  }

  const body = toLicenseFileJson(buildSignedBlob(license, device, "approved"));

  await db.auditEvent.create({
    data: {
      type: AuditEventType.license_file_generated,
      licenseId: license.id,
      deviceId: device.id,
      actor: session.user.email,
      summary: `License file generated for device ${deviceId.slice(0, 12)}…`,
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName(license.shop.name, deviceId)}"`,
      "cache-control": "no-store",
    },
  });
}

/**
 * A name support can recognise in a downloads folder without opening it, and
 * that survives being emailed: ASCII, no spaces, no quotes.
 */
function fileName(shopName: string, deviceId: string): string {
  const slug =
    shopName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "license";

  return `${slug}-${deviceId.slice(0, 8)}.lic`;
}
