import {
  AuditEventType,
  DeviceStatus,
  type Device,
  type License,
} from "generated/prisma";

import { db } from "~/server/db";

import { formatGeo, geoMatchesCluster, type RequestGeo } from "./geo";
import { normalizeLicenseKey } from "./license-key";
import {
  signBlob,
  type ApprovalState,
  type SignedLicenseBlob,
} from "./signing";

/**
 * The body of every machine-facing response, matching
 * `Pos.Core.Domain.LicenseServerResponse` field-for-field.
 *
 * PascalCase is not a style choice. The client deserializes with
 * `System.Text.Json`'s defaults, where `PropertyNameCaseInsensitive` is false,
 * so `licenseKey` or `approval_state` would silently bind to nothing and the
 * client would read every response as an empty approval state.
 */
export interface LicenseServerResponseBody {
  License: SignedLicenseBlob | null;
  ApprovalState: string;
  Error: string | null;
  /** Only present on a device-limit rejection, per the design doc's 403 shape. */
  MaxDevices?: number;
  ApprovedCount?: number;
}

export interface LicenseServerResult {
  status: number;
  body: LicenseServerResponseBody;
}

export interface ClientRequest {
  licenseKey: string;
  deviceId: string;
  hardwareFingerprint: string;
  businessName?: string | null;
  geo: RequestGeo;
}

/**
 * `ApprovalState` values the client's `ApplyServerResponseAsync` does not
 * recognise fall through its switch without touching cached state. That is the
 * right outcome for both cases below, and the reason neither reuses "blocked":
 * a mistyped key must not leave a till permanently displaying "Blocked", and a
 * device-limit rejection is a slot problem the shop can resolve, not a
 * revocation.
 */
const STATE_UNKNOWN_KEY = "invalid_key";
const STATE_DEVICE_LIMIT = "device_limit";

// ---------------------------------------------------------------------------
// POST /activate
// ---------------------------------------------------------------------------

export async function activateDevice(
  request: ClientRequest,
): Promise<LicenseServerResult> {
  const license = await findLicense(request.licenseKey);

  if (!license) {
    await recordUnknownKeyAttempt(request);
    return {
      status: 404,
      body: {
        License: null,
        ApprovalState: STATE_UNKNOWN_KEY,
        Error: "unknown license key",
      },
    };
  }

  if (license.status === "blocked") {
    await audit({
      type: AuditEventType.activation_denied_blocked,
      licenseId: license.id,
      summary: `Activation refused for device ${short(request.deviceId)}: license is blocked`,
      request,
    });
    return blockedResult("license blocked");
  }

  const existing = await db.device.findUnique({
    where: {
      licenseId_deviceId: { licenseId: license.id, deviceId: request.deviceId },
    },
  });

  // A device already on file re-runs activation (the customer pressed Activate
  // again, or reinstalled onto the same machine). Its existing verdict stands;
  // re-activating is not a way to get a second opinion on a rejection.
  if (existing?.status === DeviceStatus.approved) {
    const device = await touchDevice(existing.id, request, { checkIn: true });
    await audit({
      type: AuditEventType.activation_approved,
      licenseId: license.id,
      deviceId: device.id,
      summary: `Device ${short(request.deviceId)} re-activated (already approved)`,
      request,
    });
    return approvedResult(license, device);
  }

  if (existing?.status === DeviceStatus.pending) {
    await touchDevice(existing.id, request, { checkIn: true });
    return pendingResult();
  }

  if (existing?.status === DeviceStatus.rejected) {
    await touchDevice(existing.id, request, { checkIn: true });
    return blockedResult("device rejected");
  }

  // A deactivated row means an admin freed the slot. Coming back through
  // /activate is the hardware-swap-back case and is allowed to re-apply from
  // scratch: it still has to clear the device cap and the geo check below.
  const approved = await db.device.findMany({
    where: { licenseId: license.id, status: DeviceStatus.approved },
    select: { geoCountry: true, geoRegion: true, lastKnownIp: true },
  });

  // First device ever seen for this key. Auto-approved, and becomes the geo
  // baseline every later device is measured against.
  if (approved.length === 0) {
    const device = await upsertDevice(license.id, request, {
      status: DeviceStatus.approved,
      isBaseline: true,
    });
    await audit({
      type: AuditEventType.activation_approved,
      licenseId: license.id,
      deviceId: device.id,
      summary: `Device ${short(request.deviceId)} auto-approved as the first device on this license and is now the geo baseline`,
      request,
    });
    return approvedResult(license, device);
  }

  // The cap is checked before the geo rule, and deliberately so: the license
  // was sold as N devices full stop, which makes this a deterministic outcome
  // rather than a judgment call. Nothing is written to the device table and
  // nothing reaches the pending queue, which is what keeps that queue a pure
  // geo-review queue worth looking at.
  if (approved.length >= license.maxDevices) {
    await audit({
      type: AuditEventType.activation_denied_device_limit,
      licenseId: license.id,
      summary: `Device ${short(request.deviceId)} refused: license already has ${approved.length} of ${license.maxDevices} devices approved`,
      request,
      meta: { maxDevices: license.maxDevices, approvedCount: approved.length },
    });
    return {
      status: 403,
      body: {
        License: null,
        ApprovalState: STATE_DEVICE_LIMIT,
        Error: "device limit reached",
        MaxDevices: license.maxDevices,
        ApprovedCount: approved.length,
      },
    };
  }

  const decision = geoMatchesCluster(request.geo, approved);

  if (decision.matches) {
    const device = await upsertDevice(license.id, request, {
      status: DeviceStatus.approved,
      isBaseline: false,
    });
    await audit({
      type: AuditEventType.activation_approved,
      licenseId: license.id,
      deviceId: device.id,
      summary: `Device ${short(request.deviceId)} auto-approved: ${decision.reason}`,
      request,
      meta: { reason: decision.reason },
    });
    return approvedResult(license, device);
  }

  const device = await upsertDevice(license.id, request, {
    status: DeviceStatus.pending,
    isBaseline: false,
  });
  await audit({
    type: AuditEventType.activation_pending,
    licenseId: license.id,
    deviceId: device.id,
    summary: `Device ${short(request.deviceId)} held for review: ${decision.reason}`,
    request,
    meta: { reason: decision.reason },
  });
  return pendingResult();
}

// ---------------------------------------------------------------------------
// POST /checkin
// ---------------------------------------------------------------------------

export async function checkInDevice(
  request: ClientRequest,
): Promise<LicenseServerResult> {
  const license = await findLicense(request.licenseKey);

  if (!license || license.status === "blocked") {
    if (license) {
      await audit({
        type: AuditEventType.checkin_denied,
        licenseId: license.id,
        summary: `Check-in refused for device ${short(request.deviceId)}: license is blocked`,
        request,
      });
    }
    return blockedResult("license blocked");
  }

  const existing = await db.device.findUnique({
    where: {
      licenseId_deviceId: { licenseId: license.id, deviceId: request.deviceId },
    },
  });

  if (!existing) {
    await audit({
      type: AuditEventType.checkin_denied,
      licenseId: license.id,
      summary: `Check-in refused: device ${short(request.deviceId)} is not registered on this license`,
      request,
    });
    return blockedResult("device not recognised");
  }

  if (
    existing.status === DeviceStatus.rejected ||
    existing.status === DeviceStatus.deactivated
  ) {
    await audit({
      type: AuditEventType.checkin_denied,
      licenseId: license.id,
      deviceId: existing.id,
      summary: `Check-in refused: device ${short(request.deviceId)} is ${existing.status}`,
      request,
    });
    return blockedResult(
      existing.status === DeviceStatus.rejected
        ? "device rejected"
        : "device deactivated",
    );
  }

  const device = await touchDevice(existing.id, request, { checkIn: true });

  await audit({
    type: AuditEventType.checkin,
    licenseId: license.id,
    deviceId: device.id,
    summary: `Device ${short(request.deviceId)} checked in (${device.status})`,
    request,
  });

  if (device.status === DeviceStatus.pending) return pendingResult();

  return approvedResult(license, device);
}

// ---------------------------------------------------------------------------
// DELETE /device
// ---------------------------------------------------------------------------

export interface DeactivateResult {
  ok: boolean;
  error?: string;
}

/**
 * Frees a slot under `maxDevices`. The row is kept rather than deleted so the
 * audit trail survives, and so the device's next check-in can be answered with
 * a definite 410 instead of the vaguer "not registered".
 */
export async function deactivateDevice(input: {
  licenseKey: string;
  deviceId: string;
  actor: string;
}): Promise<DeactivateResult> {
  const license = await findLicense(input.licenseKey);
  if (!license) return { ok: false, error: "unknown license key" };

  const device = await db.device.findUnique({
    where: {
      licenseId_deviceId: { licenseId: license.id, deviceId: input.deviceId },
    },
  });
  if (!device) return { ok: false, error: "unknown device" };

  await deactivateDeviceRow(device.id, input.actor);
  return { ok: true };
}

/** The admin panel's own entry point, which already holds the row id. */
export async function deactivateDeviceRow(
  deviceRowId: string,
  actor: string,
): Promise<void> {
  const device = await db.device.update({
    where: { id: deviceRowId },
    data: { status: DeviceStatus.deactivated, isBaseline: false },
  });

  await audit({
    type: AuditEventType.device_deactivated,
    licenseId: device.licenseId,
    deviceId: device.id,
    actor,
    summary: `Device ${short(device.deviceId)} deactivated, freeing a slot`,
  });
}

/**
 * Undoes a deactivation, taking the slot back.
 *
 * Deactivation is the one reversible verdict here: it means "this till is not in
 * use", not "this till is not trusted", so the way back is an admin saying so
 * rather than the shop re-running activation. Rejection is deliberately not
 * reversible this way — a rejected device failed the location check, and putting
 * it back needs the same evidence the queue shows, so it goes through /activate
 * and lands in the queue again.
 *
 * Re-checks the cap, because the slot this device gave up may have been taken by
 * another till in the meantime, and re-takes the baseline if the license has
 * been left with no approved device to cluster against.
 *
 * Logged as `device_approved` rather than a type of its own: the audit feed
 * reads summaries and this is an approval by another name, so a new enum value
 * would need a schema push to buy nothing.
 */
export async function reactivateDevice(
  deviceRowId: string,
  actor: string,
): Promise<{ ok: boolean; error?: string }> {
  const device = await db.device.findUnique({
    where: { id: deviceRowId },
    include: { license: true },
  });
  if (!device) return { ok: false, error: "unknown device" };

  if (device.status !== DeviceStatus.deactivated) {
    return {
      ok: false,
      error: `Only a deactivated device can be reactivated; this one is ${device.status}.`,
    };
  }

  const approvedCount = await db.device.count({
    where: { licenseId: device.licenseId, status: DeviceStatus.approved },
  });

  if (approvedCount >= device.license.maxDevices) {
    return {
      ok: false,
      error: `This license already has ${approvedCount} of ${device.license.maxDevices} devices approved. Deactivate one first.`,
    };
  }

  await db.device.update({
    where: { id: device.id },
    data: {
      status: DeviceStatus.approved,
      approvedAt: new Date(),
      isBaseline: approvedCount === 0,
    },
  });

  await audit({
    type: AuditEventType.device_approved,
    licenseId: device.licenseId,
    deviceId: device.id,
    actor,
    summary: `Device ${short(device.deviceId)} reactivated, taking a slot back`,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin decisions on the pending queue
// ---------------------------------------------------------------------------

export async function approveDevice(
  deviceRowId: string,
  actor: string,
): Promise<{ ok: boolean; error?: string }> {
  const device = await db.device.findUnique({
    where: { id: deviceRowId },
    include: { license: true },
  });
  if (!device) return { ok: false, error: "unknown device" };

  const approvedCount = await db.device.count({
    where: {
      licenseId: device.licenseId,
      status: DeviceStatus.approved,
      id: { not: device.id },
    },
  });

  // The cap binds a human approving from the queue exactly as it binds the
  // endpoint. Without this an admin could click past the limit the customer
  // actually bought, and the count shown on the license list would stop
  // matching what the license permits.
  if (approvedCount >= device.license.maxDevices) {
    return {
      ok: false,
      error: `This license already has ${approvedCount} of ${device.license.maxDevices} devices approved. Deactivate one first.`,
    };
  }

  await db.device.update({
    where: { id: device.id },
    data: {
      status: DeviceStatus.approved,
      approvedAt: new Date(),
      isBaseline: approvedCount === 0,
    },
  });

  await audit({
    type: AuditEventType.device_approved,
    licenseId: device.licenseId,
    deviceId: device.id,
    actor,
    summary: `Device ${short(device.deviceId)} approved`,
  });

  return { ok: true };
}

export async function rejectDevice(
  deviceRowId: string,
  actor: string,
): Promise<{ ok: boolean; error?: string }> {
  const device = await db.device.findUnique({ where: { id: deviceRowId } });
  if (!device) return { ok: false, error: "unknown device" };

  await db.device.update({
    where: { id: device.id },
    data: { status: DeviceStatus.rejected, isBaseline: false },
  });

  await audit({
    type: AuditEventType.device_rejected,
    licenseId: device.licenseId,
    deviceId: device.id,
    actor,
    summary: `Device ${short(device.deviceId)} rejected`,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Blob construction
// ---------------------------------------------------------------------------

/**
 * Builds and signs the blob for one device. Shared by the endpoints and by the
 * admin panel's `.lic` generation so a file handed to a customer and a live
 * activation cannot disagree about what the license says.
 */
export function buildSignedBlob(
  license: Pick<License, "key" | "shopLabel" | "validUntil" | "issuedAt">,
  device: Pick<Device, "deviceId">,
  approvalState: ApprovalState = "approved",
): SignedLicenseBlob {
  return signBlob({
    LicenseKey: license.key,
    DeviceId: device.deviceId,
    ShopLabel: license.shopLabel,
    ValidUntil: license.validUntil,
    IssuedAt: license.issuedAt,
    ApprovalState: approvalState,
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function findLicense(rawKey: string) {
  const key = normalizeLicenseKey(rawKey);
  if (!key) return Promise.resolve(null);
  return db.license.findUnique({ where: { key } });
}

function approvedResult(license: License, device: Device): LicenseServerResult {
  return {
    status: 200,
    body: {
      License: buildSignedBlob(license, device, "approved"),
      ApprovalState: "approved",
      Error: null,
    },
  };
}

function pendingResult(): LicenseServerResult {
  return {
    status: 202,
    body: { License: null, ApprovalState: "pending", Error: null },
  };
}

function blockedResult(error: string): LicenseServerResult {
  return {
    status: 410,
    body: { License: null, ApprovalState: "blocked", Error: error },
  };
}

async function upsertDevice(
  licenseId: string,
  request: ClientRequest,
  options: { status: DeviceStatus; isBaseline: boolean },
): Promise<Device> {
  const now = new Date();
  const geoFields = {
    lastKnownIp: request.geo.ip,
    geoCountry: request.geo.country,
    geoRegion: request.geo.region,
    geoCity: request.geo.city,
  };

  return db.device.upsert({
    where: { licenseId_deviceId: { licenseId, deviceId: request.deviceId } },
    create: {
      licenseId,
      deviceId: request.deviceId,
      hardwareFingerprint: request.hardwareFingerprint,
      status: options.status,
      isBaseline: options.isBaseline,
      lastCheckIn: now,
      approvedAt: options.status === DeviceStatus.approved ? now : null,
      ...geoFields,
    },
    update: {
      hardwareFingerprint: request.hardwareFingerprint,
      status: options.status,
      isBaseline: options.isBaseline,
      lastCheckIn: now,
      approvedAt: options.status === DeviceStatus.approved ? now : null,
      ...geoFields,
    },
  });
}

/** Refreshes the locality and liveness columns without changing the verdict. */
async function touchDevice(
  deviceRowId: string,
  request: ClientRequest,
  options: { checkIn: boolean },
): Promise<Device> {
  const before = await db.device.findUniqueOrThrow({
    where: { id: deviceRowId },
  });

  const device = await db.device.update({
    where: { id: deviceRowId },
    data: {
      hardwareFingerprint: request.hardwareFingerprint,
      lastKnownIp: request.geo.ip,
      geoCountry: request.geo.country,
      geoRegion: request.geo.region,
      geoCity: request.geo.city,
      ...(options.checkIn ? { lastCheckIn: new Date() } : {}),
    },
  });

  // Same device id, different hardware, is the signature of a copied database
  // rather than of a hardware upgrade. It does not change the verdict, because
  // the fingerprint is an audit trail and not the shop-membership signal, but
  // it is worth a line in the log for the support conversation that follows.
  if (
    before.hardwareFingerprint &&
    before.hardwareFingerprint !== request.hardwareFingerprint
  ) {
    await audit({
      type: AuditEventType.checkin,
      licenseId: device.licenseId,
      deviceId: device.id,
      summary: `Device ${short(device.deviceId)} reported different hardware than previously recorded`,
      request,
      meta: {
        previousFingerprint: before.hardwareFingerprint,
        currentFingerprint: request.hardwareFingerprint,
      },
    });
  }

  return device;
}

/**
 * An activation against a key that does not exist has nowhere to hang an audit
 * row, but repeated attempts are worth seeing, so it is recorded unattached.
 */
async function recordUnknownKeyAttempt(request: ClientRequest) {
  await audit({
    type: AuditEventType.activation_denied_blocked,
    summary: `Activation attempted with unknown key ${request.licenseKey}`,
    request,
  });
}

async function audit(input: {
  type: AuditEventType;
  licenseId?: string;
  deviceId?: string;
  summary: string;
  actor?: string;
  request?: ClientRequest;
  meta?: Record<string, unknown>;
}) {
  await db.auditEvent.create({
    data: {
      type: input.type,
      licenseId: input.licenseId ?? null,
      deviceId: input.deviceId ?? null,
      summary: input.summary,
      actor: input.actor ?? "client",
      ip: input.request?.geo.ip ?? null,
      geo: input.request ? formatGeo(input.request.geo) : null,
      meta: input.meta ? (input.meta as object) : undefined,
    },
  });
}

/** Device ids are 32 hex characters; log lines only need enough to tell them apart. */
function short(deviceId: string): string {
  return deviceId.length > 12 ? `${deviceId.slice(0, 12)}…` : deviceId;
}
