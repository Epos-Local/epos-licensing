import { AuditEventType } from "generated/prisma";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { buildSignedBlob } from "~/server/licensing/service";
import { toLicenseFileJson } from "~/server/licensing/signing";

/**
 * Generates the offline `.lic` file for one approved device.
 *
 * This is the manual activation path from `LICENSE_FILE.md`: the customer reads
 * their device id off Settings &rsaquo; License, support finds that device here,
 * and the file that comes back is bound to it. The client refuses a file whose
 * `DeviceId` does not match the install it is loaded onto, so this cannot be
 * generated speculatively, only against a device already on record.
 *
 * The file is byte-identical in structure to what a live activation returns,
 * because both go through `buildSignedBlob`. A customer who activates online
 * and then exports through "Copy license to file" gets the same bytes back.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; deviceRowId: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Authentication required.", { status: 401 });
  }

  const { id, deviceRowId } = await params;

  const device = await db.device.findFirst({
    where: { id: deviceRowId, licenseId: id },
    include: { license: { include: { shop: true } } },
  });

  if (!device) return new Response("No such device.", { status: 404 });

  // Handing a customer a file for a device that is pending or rejected would
  // grant exactly what the review queue withheld, and would do it without
  // leaving a decision behind. Approve the device first.
  if (device.status !== "approved") {
    return new Response(
      `This device is ${device.status}. Approve it before generating a license file.`,
      { status: 409 },
    );
  }

  const signed = buildSignedBlob(device.license, device, "approved");
  const body = toLicenseFileJson(signed);

  await db.auditEvent.create({
    data: {
      type: AuditEventType.license_file_generated,
      licenseId: device.licenseId,
      deviceId: device.id,
      actor: session.user.email,
      summary: `License file generated for device ${device.deviceId.slice(0, 12)}…`,
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName(device.license.shop.name, device.deviceId)}"`,
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
