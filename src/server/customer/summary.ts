import { DeviceStatus } from "generated/prisma";
import { db } from "~/server/db";

export interface CustomerLicenseSummary {
  status: "active" | "blocked";
  validUntil: Date;
  maxDevices: number;
  approvedDeviceCount: number;
}

/**
 * The one license `GET /api/customer/me` shows: the shop's most recently
 * issued one. Most shops will only ever have one; if a replacement is ever
 * issued, the newest is the one that matters to the owner checking their
 * account, not the history of it.
 */
export async function latestLicenseSummary(
  shopId: string,
): Promise<CustomerLicenseSummary | null> {
  const license = await db.license.findFirst({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    include: { devices: { where: { status: DeviceStatus.approved } } },
  });

  if (!license) return null;

  return {
    status: license.status,
    validUntil: license.validUntil,
    maxDevices: license.maxDevices,
    approvedDeviceCount: license.devices.length,
  };
}
