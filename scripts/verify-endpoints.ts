/**
 * Exercises the machine-facing endpoints the way the WPF client does.
 *
 *   pnpm dev            # in one terminal
 *   pnpm verify:endpoints
 *
 * Point somewhere else with VERIFY_BASE_URL. Geolocation is simulated by
 * sending the `x-vercel-ip-*` headers the edge network would normally attach,
 * which is the only way to reach the clustering logic without two machines in
 * two cities.
 *
 * Fixtures are created and removed by this script. Everything it makes is named
 * with the run's own timestamp, and the teardown deletes only those rows.
 */

// Side-effect import, and it must stay first: it has to run before ~/server/db
// builds its client.
import "./quiet";

import { randomBytes } from "node:crypto";

import { db } from "~/server/db";
import { generateLicenseKey } from "~/server/licensing/license-key";
import {
  approveDevice,
  deactivateDeviceRow,
  reactivateDevice,
  rejectDevice,
} from "~/server/licensing/service";
import {
  getPublicKeyPkcs1Base64,
  verifySignedBlob,
  verifyUpdate,
  type SerializedLicenseBlob,
} from "~/server/licensing/signing";

import { check, checkEqual, cleanUp, group, summarize } from "./harness";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const RUN = `verify-${Date.now()}`;
const publicKey = getPublicKeyPkcs1Base64();

/** Two tills in one shop: same town, different broadband. */
const LONDON = { country: "GB", region: "ENG", city: "London" };
const LONDON_IP_A = "203.0.113.10";
const LONDON_IP_B = "198.51.100.77";

/** A different country entirely: the copied-database case. */
const PARIS = { country: "FR", region: "IDF", city: "Paris" };
const PARIS_IP = "192.0.2.50";

const CALIFORNIA = { country: "US", region: "CA", city: "San Jose" };
const CALIFORNIA_IP = "192.0.2.200";

interface Geo {
  country: string;
  region: string;
  city: string;
}

interface Reply {
  status: number;
  raw: string;
  body: {
    License: { Payload: SerializedLicenseBlob; Signature: string } | null;
    ApprovalState: string;
    Error: string | null;
    MaxDevices?: number;
    ApprovedCount?: number;
  };
}

async function post(
  path: string,
  body: Record<string, unknown>,
  options: { geo?: Geo; ip?: string } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (options.ip) headers["x-forwarded-for"] = options.ip;
  if (options.geo) {
    headers["x-vercel-ip-country"] = options.geo.country;
    headers["x-vercel-ip-country-region"] = options.geo.region;
    headers["x-vercel-ip-city"] = options.geo.city;
  }

  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  return {
    status: response.status,
    raw,
    body: JSON.parse(raw) as Reply["body"],
  };
}

/** The exact PascalCase shape System.Text.Json serializes on the client. */
function activateBody(licenseKey: string, deviceId: string) {
  return {
    LicenseKey: licenseKey,
    DeviceId: deviceId,
    HardwareFingerprint: randomBytes(32).toString("hex").toUpperCase(),
    BusinessName: null,
  };
}

function checkInBody(licenseKey: string, deviceId: string) {
  return {
    LicenseKey: licenseKey,
    DeviceId: deviceId,
    HardwareFingerprint: randomBytes(32).toString("hex").toUpperCase(),
  };
}

/**
 * POST /release answers with its own small shape rather than a license body,
 * so it needs its own poster. A fresh fingerprint every call is deliberate: a
 * shop replacing hardware is exactly who releases a device, and the endpoint
 * must not quietly depend on the fingerprint matching.
 */
async function postRelease(
  licenseKey: string,
  deviceId: string,
): Promise<{
  status: number;
  body: { Ok: boolean; Error: string | null; RetryAfterUtc: string | null };
}> {
  const response = await fetch(`${BASE}/api/release`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(checkInBody(licenseKey, deviceId)),
  });

  return {
    status: response.status,
    body: (await response.json()) as {
      Ok: boolean;
      Error: string | null;
      RetryAfterUtc: string | null;
    },
  };
}

const deviceId = () => randomBytes(16).toString("hex");

async function makeLicense(label: string, maxDevices = 2) {
  const shop = await db.shop.create({
    data: { name: `${RUN} ${label}`, email: `${RUN}@example.invalid` },
  });

  const validUntil = new Date();
  validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);

  return db.license.create({
    data: {
      key: generateLicenseKey(),
      shopId: shop.id,
      shopLabel: "Joe's Kebab & Grill",
      maxDevices,
      validUntil,
    },
  });
}

async function run() {
  // -------------------------------------------------------------------------
  group("Reachability");

  try {
    const probe = await fetch(`${BASE}/api/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    check(`${BASE} is serving /api/activate`, probe.status === 400);
  } catch {
    console.log(
      `\n  Could not reach ${BASE}. Start it with \`pnpm dev\` first.`,
    );
    process.exitCode = 1;
    return;
  }

  // -------------------------------------------------------------------------
  group("First activation on a key");

  const l1 = await makeLicense("first-activation");
  const deviceA = deviceId();

  const first = await post("/api/activate", activateBody(l1.key, deviceA), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });

  checkEqual("returns 200", first.status, 200);
  checkEqual(
    "approval state is approved",
    first.body.ApprovalState,
    "approved",
  );
  check("a signed blob comes back", first.body.License !== null);
  check(
    "the blob verifies against the client's public key",
    first.body.License !== null &&
      verifySignedBlob(first.body.License, publicKey),
  );
  checkEqual(
    "the blob is bound to the requesting device",
    first.body.License?.Payload.DeviceId,
    deviceA,
  );
  checkEqual(
    "the blob carries the license key",
    first.body.License?.Payload.LicenseKey,
    l1.key,
  );
  checkEqual(
    "the shop label survives its apostrophe and ampersand",
    first.body.License?.Payload.ShopLabel,
    "Joe's Kebab & Grill",
  );

  check(
    "the response is PascalCase, which is what System.Text.Json binds against",
    first.raw.includes('"ApprovalState"') &&
      first.raw.includes('"License"') &&
      !first.raw.includes('"approvalState"'),
  );

  const rowA = await db.device.findFirst({
    where: { licenseId: l1.id, deviceId: deviceA },
  });
  checkEqual("the device is stored as approved", rowA?.status, "approved");
  check("and becomes the geo baseline", rowA?.isBaseline === true);
  checkEqual("its location was recorded", rowA?.geoCity, "London");

  // -------------------------------------------------------------------------
  group("Second device, same location");

  const deviceB = deviceId();
  const second = await post("/api/activate", activateBody(l1.key, deviceB), {
    geo: LONDON,
    ip: LONDON_IP_B,
  });

  checkEqual("returns 200", second.status, 200);
  checkEqual(
    "approval state is approved",
    second.body.ApprovalState,
    "approved",
  );
  check(
    "its blob verifies too",
    second.body.License !== null &&
      verifySignedBlob(second.body.License, publicKey),
  );

  const rowB = await db.device.findFirst({
    where: { licenseId: l1.id, deviceId: deviceB },
  });
  checkEqual("stored as approved", rowB?.status, "approved");
  check("but is not the baseline", rowB?.isBaseline === false);

  // The /24 clause covers a shop whose region reading is missing entirely.
  const lSubnet = await makeLicense("same-subnet");
  const subnetA = deviceId();
  const subnetB = deviceId();
  await post("/api/activate", activateBody(lSubnet.key, subnetA), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });
  const sameSubnet = await post(
    "/api/activate",
    activateBody(lSubnet.key, subnetB),
    { ip: "203.0.113.99" },
  );
  checkEqual(
    "a device on the same /24 approves even with no geo headers",
    sameSubnet.body.ApprovalState,
    "approved",
  );

  // -------------------------------------------------------------------------
  group("Second device, different location");

  const l2 = await makeLicense("geo-mismatch");
  const l2First = deviceId();
  const l2Far = deviceId();

  await post("/api/activate", activateBody(l2.key, l2First), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });

  const far = await post("/api/activate", activateBody(l2.key, l2Far), {
    geo: PARIS,
    ip: PARIS_IP,
  });

  checkEqual("returns 202", far.status, 202);
  checkEqual("approval state is pending", far.body.ApprovalState, "pending");
  checkEqual("no blob is issued", far.body.License, null);

  const pendingRow = await db.device.findFirst({
    where: { licenseId: l2.id, deviceId: l2Far },
  });
  checkEqual("the device is stored as pending", pendingRow?.status, "pending");

  const inQueue = await db.device.count({
    where: { status: "pending", licenseId: l2.id },
  });
  checkEqual("and appears in the review queue", inQueue, 1);

  const stillPending = await post("/api/checkin", checkInBody(l2.key, l2Far), {
    geo: PARIS,
    ip: PARIS_IP,
  });
  checkEqual(
    "checking in repeatedly does not age it out of the queue",
    stillPending.status,
    202,
  );

  await approveDevice(pendingRow!.id, "verify@example.invalid");

  const afterApproval = await post("/api/checkin", checkInBody(l2.key, l2Far), {
    geo: PARIS,
    ip: PARIS_IP,
  });
  checkEqual("once approved, check-in returns 200", afterApproval.status, 200);
  check(
    "and hands over a valid blob",
    afterApproval.body.License !== null &&
      verifySignedBlob(afterApproval.body.License, publicKey),
  );

  // -------------------------------------------------------------------------
  group("Rejecting from the queue");

  const l3 = await makeLicense("rejection");
  const l3First = deviceId();
  const l3Bad = deviceId();

  await post("/api/activate", activateBody(l3.key, l3First), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });
  const toReject = await post("/api/activate", activateBody(l3.key, l3Bad), {
    geo: CALIFORNIA,
    ip: CALIFORNIA_IP,
  });
  checkEqual("the far device is pending first", toReject.status, 202);

  const rejectRow = await db.device.findFirst({
    where: { licenseId: l3.id, deviceId: l3Bad },
  });
  await rejectDevice(rejectRow!.id, "verify@example.invalid");

  const rejected = await post("/api/checkin", checkInBody(l3.key, l3Bad), {
    geo: CALIFORNIA,
    ip: CALIFORNIA_IP,
  });
  checkEqual("a rejected device gets 410 on check-in", rejected.status, 410);
  checkEqual(
    "with approval state blocked",
    rejected.body.ApprovalState,
    "blocked",
  );

  // -------------------------------------------------------------------------
  group("Device limit is a hard cap");

  const overA = deviceId();

  // Same location as the two already approved, so only the cap can refuse it.
  const capped = await post("/api/activate", activateBody(l1.key, overA), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });

  checkEqual("returns 403", capped.status, 403);
  checkEqual(
    "the error names the limit",
    capped.body.Error,
    "device limit reached",
  );
  checkEqual("and reports it", capped.body.MaxDevices, 2);
  checkEqual("along with the count", capped.body.ApprovedCount, 2);
  checkEqual("no blob is issued", capped.body.License, null);

  check(
    "the approval state is not 'blocked', which would brand the till wrongly",
    capped.body.ApprovalState !== "blocked",
  );

  const overRow = await db.device.findFirst({
    where: { licenseId: l1.id, deviceId: overA },
  });
  checkEqual("no device row is written at all", overRow, null);

  const l1Pending = await db.device.count({
    where: { licenseId: l1.id, status: "pending" },
  });
  checkEqual("and nothing reaches the pending queue", l1Pending, 0);

  const overB = deviceId();
  const cappedFar = await post("/api/activate", activateBody(l1.key, overB), {
    geo: PARIS,
    ip: PARIS_IP,
  });
  checkEqual(
    "the cap outranks the geo check rather than sitting behind it",
    cappedFar.status,
    403,
  );

  // -------------------------------------------------------------------------
  group("The cap also binds the operator");

  // A device can be queued while a slot is free and the slot can then be taken
  // by someone else before anyone acts on the queue. Approving from the queue
  // has to re-check the cap, or a click puts the license over the limit the
  // customer actually bought and the device count stops meaning anything.
  const l4 = await makeLicense("queue-then-full");
  const l4First = deviceId();
  const l4Queued = deviceId();
  const l4Second = deviceId();

  await post("/api/activate", activateBody(l4.key, l4First), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });
  const l4Pending = await post(
    "/api/activate",
    activateBody(l4.key, l4Queued),
    {
      geo: PARIS,
      ip: PARIS_IP,
    },
  );
  checkEqual("a device is queued while a slot is free", l4Pending.status, 202);

  const l4Filled = await post("/api/activate", activateBody(l4.key, l4Second), {
    geo: LONDON,
    ip: LONDON_IP_B,
  });
  checkEqual("another device then takes the last slot", l4Filled.status, 200);

  const queuedRow = await db.device.findFirstOrThrow({
    where: { licenseId: l4.id, deviceId: l4Queued },
  });
  const lateApproval = await approveDevice(
    queuedRow.id,
    "verify@example.invalid",
  );

  check(
    "approving the queued device is refused rather than exceeding the limit",
    !lateApproval.ok,
    lateApproval.error,
  );
  check(
    "and the refusal explains how to proceed",
    (lateApproval.error ?? "").includes("Deactivate"),
    lateApproval.error,
  );

  const stillQueued = await db.device.findFirstOrThrow({
    where: { id: queuedRow.id },
  });
  checkEqual("the device stays pending", stillQueued.status, "pending");

  const l4Approved = await db.device.count({
    where: { licenseId: l4.id, status: "approved" },
  });
  checkEqual("and the license stays at its limit", l4Approved, 2);

  // -------------------------------------------------------------------------
  group("Freeing a slot");

  await deactivateDeviceRow(rowB!.id, "verify@example.invalid");

  const deactivated = await post("/api/checkin", checkInBody(l1.key, deviceB), {
    geo: LONDON,
    ip: LONDON_IP_B,
  });
  checkEqual("the deactivated device gets 410", deactivated.status, 410);

  const replacement = deviceId();
  const swapped = await post(
    "/api/activate",
    activateBody(l1.key, replacement),
    { geo: LONDON, ip: LONDON_IP_B },
  );
  checkEqual(
    "and the freed slot lets replacement hardware activate",
    swapped.status,
    200,
  );

  // -------------------------------------------------------------------------
  group("Blocked license");

  await db.license.update({
    where: { id: l3.id },
    data: { status: "blocked" },
  });

  const blockedActivate = await post(
    "/api/activate",
    activateBody(l3.key, l3First),
    { geo: LONDON, ip: LONDON_IP_A },
  );
  checkEqual("activation returns 410", blockedActivate.status, 410);
  checkEqual(
    "with approval state blocked",
    blockedActivate.body.ApprovalState,
    "blocked",
  );

  const blockedCheckIn = await post(
    "/api/checkin",
    checkInBody(l3.key, l3First),
    { geo: LONDON, ip: LONDON_IP_A },
  );
  checkEqual("check-in returns 410", blockedCheckIn.status, 410);

  // -------------------------------------------------------------------------
  group("Unknown input");

  const unknownKey = await post(
    "/api/activate",
    activateBody("ZZZZ-9999-ZZZZ-9999", deviceId()),
    { geo: LONDON, ip: LONDON_IP_A },
  );
  checkEqual("an unknown key returns 404", unknownKey.status, 404);
  check(
    "and does not tell the till it is blocked, which a typo would earn forever",
    unknownKey.body.ApprovalState !== "blocked",
  );

  const unknownDevice = await post(
    "/api/checkin",
    checkInBody(l1.key, deviceId()),
    { geo: LONDON, ip: LONDON_IP_A },
  );
  checkEqual(
    "an unregistered device returns 410 on check-in",
    unknownDevice.status,
    410,
  );

  const malformed = await post("/api/activate", { nonsense: true });
  checkEqual("a malformed body returns 400", malformed.status, 400);

  // -------------------------------------------------------------------------
  group("No geolocation available");

  const l5 = await makeLicense("no-geo");
  const geoA = deviceId();
  const geoB = deviceId();

  await post("/api/activate", activateBody(l5.key, geoA), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });

  const noGeo = await post("/api/activate", activateBody(l5.key, geoB), {
    ip: "10.0.0.4",
  });
  checkEqual(
    "an unlocatable second device is held rather than waved through",
    noGeo.status,
    202,
  );

  // -------------------------------------------------------------------------
  group("Admin-only device release");

  const unauthorized = await fetch(`${BASE}/api/device`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ LicenseKey: l1.key, DeviceId: deviceA }),
  });
  checkEqual(
    "DELETE /api/device refuses an unauthenticated caller",
    unauthorized.status,
    401,
  );

  const stillThere = await db.device.findFirst({
    where: { licenseId: l1.id, deviceId: deviceA },
  });
  checkEqual("and changes nothing", stillThere?.status, "approved");

  // -------------------------------------------------------------------------
  group("A till releasing its own slot");

  const l6 = await makeLicense("self-release", 1);
  const l6Device = deviceId();
  await post("/api/activate", activateBody(l6.key, l6Device), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });

  const cappedBeforeRelease = await post(
    "/api/activate",
    activateBody(l6.key, deviceId()),
    { geo: LONDON, ip: LONDON_IP_A },
  );
  checkEqual(
    "a second device is refused while the first holds the only slot",
    cappedBeforeRelease.status,
    403,
  );

  const released = await postRelease(l6.key, l6Device);
  checkEqual("POST /api/release accepts the device's own id", released.status, 200);
  checkEqual("and reports success", released.body.Ok, true);

  const releasedRow = await db.device.findFirst({
    where: { licenseId: l6.id, deviceId: l6Device },
  });
  checkEqual("the row is deactivated", releasedRow?.status, "deactivated");
  check(
    "and stamped so the cooldown can be enforced",
    releasedRow?.lastSelfReleaseAt instanceof Date,
  );

  const releasedCheckIn = await post(
    "/api/checkin",
    checkInBody(l6.key, l6Device),
  );
  checkEqual(
    "the released till's next check-in is refused",
    releasedCheckIn.status,
    410,
  );

  const intoFreedSlot = await post(
    "/api/activate",
    activateBody(l6.key, deviceId()),
    { geo: LONDON, ip: LONDON_IP_B },
  );
  checkEqual(
    "and the freed slot lets the replacement machine activate",
    intoFreedSlot.status,
    200,
  );

  // -------------------------------------------------------------------------
  group("Release is idempotent, and rate limited");

  const repeat = await postRelease(l6.key, l6Device);
  checkEqual(
    "releasing an already-released device is not an error",
    repeat.status,
    200,
  );

  // A licence of its own, because the cooldown can only be reached by a device
  // that holds a slot again: on l6 the replacement machine has already taken the
  // only one, so reactivating there is refused by the cap and the next release
  // would harmlessly hit the idempotent branch instead of the limit.
  const l6b = await makeLicense("release-cooldown", 1);
  const l6bDevice = deviceId();
  await post("/api/activate", activateBody(l6b.key, l6bDevice), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });
  await postRelease(l6b.key, l6bDevice);

  const l6bRow = await db.device.findFirst({
    where: { licenseId: l6b.id, deviceId: l6bDevice },
  });
  // Put it back the way an admin would, so the cooldown is what refuses the
  // next release rather than the device simply having no slot to give up.
  const putBack = await reactivateDevice(l6bRow!.id, "verify@example.invalid");
  check(
    "an admin can hand the slot back to a till that released it",
    putBack.ok,
    putBack.error,
  );

  const tooSoon = await postRelease(l6b.key, l6bDevice);
  checkEqual("a second release within 24h is refused", tooSoon.status, 429);
  checkEqual("with Ok false", tooSoon.body.Ok, false);
  check(
    "and says when the next one is possible",
    typeof tooSoon.body.RetryAfterUtc === "string" &&
      new Date(tooSoon.body.RetryAfterUtc).getTime() > Date.now(),
    `RetryAfterUtc was ${JSON.stringify(tooSoon.body.RetryAfterUtc)}`,
  );

  const stillHeld = await db.device.findFirst({
    where: { licenseId: l6b.id, deviceId: l6bDevice },
  });
  checkEqual("the slot is still held", stillHeld?.status, "approved");

  const strangerRelease = await postRelease(l6.key, deviceId());
  checkEqual(
    "and a device not on the license cannot release anything",
    strangerRelease.status,
    404,
  );

  // -------------------------------------------------------------------------
  group("Stale devices give their slots back");

  const l7 = await makeLicense("stale-reclaim", 1);
  const l7Old = deviceId();
  await post("/api/activate", activateBody(l7.key, l7Old), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });

  // 100 days without a check-in: past the 90-day threshold, and well past the
  // client's own 14-day offline grace.
  await db.device.updateMany({
    where: { licenseId: l7.id, deviceId: l7Old },
    data: { lastCheckIn: new Date(Date.now() - 100 * 86_400_000) },
  });

  const afterReclaim = await post(
    "/api/activate",
    activateBody(l7.key, deviceId()),
    { geo: LONDON, ip: LONDON_IP_B },
  );
  checkEqual(
    "a new till activates into the slot a dormant one was holding",
    afterReclaim.status,
    200,
  );

  const reclaimedRow = await db.device.findFirst({
    where: { licenseId: l7.id, deviceId: l7Old },
  });
  checkEqual("the dormant device is deactivated", reclaimedRow?.status, "deactivated");

  const reclaimAudit = await db.auditEvent.findFirst({
    where: { licenseId: l7.id, type: "device_deactivated" },
  });
  checkEqual(
    "credited to the system, not to an admin who did nothing",
    reclaimAudit?.actor,
    "system",
  );

  const l8 = await makeLicense("fresh-not-stale", 1);
  const l8Device = deviceId();
  await post("/api/activate", activateBody(l8.key, l8Device), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });
  const notStale = await post("/api/activate", activateBody(l8.key, deviceId()), {
    geo: LONDON,
    ip: LONDON_IP_B,
  });
  checkEqual(
    "a device that checked in today keeps its slot",
    notStale.status,
    403,
  );

  // -------------------------------------------------------------------------
  group("An emptied license keeps its locality baseline");

  // The regression this exists for: with the baseline held only on the device
  // rows, freeing every slot — by admin, by self-release, or by the reclaim
  // above — left `activateDevice` with nothing to compare against, so it treated
  // the next caller as the license's first device and auto-approved it from
  // anywhere on earth.
  const l9 = await makeLicense("emptied-baseline", 1);
  const l9Device = deviceId();
  await post("/api/activate", activateBody(l9.key, l9Device), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });

  const l9Row = await db.device.findFirst({
    where: { licenseId: l9.id, deviceId: l9Device },
  });
  await deactivateDeviceRow(l9Row!.id, "verify@example.invalid");

  const emptied = await db.device.count({
    where: { licenseId: l9.id, status: "approved" },
  });
  checkEqual("no approved device remains", emptied, 0);

  const farAway = await post("/api/activate", activateBody(l9.key, deviceId()), {
    geo: PARIS,
    ip: PARIS_IP,
  });
  checkEqual(
    "a device in another country is still held for review",
    farAway.status,
    202,
  );
  checkEqual("rather than auto-approved", farAway.body.ApprovalState, "pending");

  const l9Baseline = await db.license.findUnique({ where: { id: l9.id } });
  checkEqual(
    "because the baseline was kept on the license",
    l9Baseline?.baselineCountry,
    "GB",
  );

  const backHome = await post("/api/activate", activateBody(l9.key, deviceId()), {
    geo: LONDON,
    ip: LONDON_IP_B,
  });
  checkEqual(
    "and a device back at the shop still activates against it",
    backHome.status,
    200,
  );

  // -------------------------------------------------------------------------
  group("Update announcements");

  const l10 = await makeLicense("updates");
  const l10Device = deviceId();

  const noRelease = await post("/api/activate", activateBody(l10.key, l10Device), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });
  check(
    "nothing published means the fields are absent, not empty",
    !("UpdateVersion" in (JSON.parse(noRelease.raw) as object)),
    noRelease.raw,
  );

  const release = await db.appRelease.create({
    data: {
      version: "0.4.0",
      minimumVersion: "0.3.0",
      downloadUrl: "https://releases.example/EPos365-Setup.exe",
      sha256: "a".repeat(64),
      notes: RUN,
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  const announced = await post("/api/checkin", checkInBody(l10.key, l10Device), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });
  const update = JSON.parse(announced.raw) as {
    UpdateVersion?: string;
    UpdateMinimumVersion?: string;
    UpdateUrl?: string;
    UpdateSha256?: string;
    UpdateSignature?: string;
  };

  checkEqual("a published release rides along on check-in", update.UpdateVersion, "0.4.0");
  checkEqual("with the floor that decides blocking", update.UpdateMinimumVersion, "0.3.0");
  checkEqual("the installer link", update.UpdateUrl, release.downloadUrl);
  checkEqual("and the hash the till verifies it against", update.UpdateSha256, release.sha256);

  check(
    "the announcement verifies against the public key the client embeds",
    verifyUpdate(
      {
        version: update.UpdateVersion!,
        minimumVersion: update.UpdateMinimumVersion!,
        downloadUrl: update.UpdateUrl!,
        sha256: update.UpdateSha256!,
      },
      update.UpdateSignature!,
      publicKey,
    ),
  );

  // The signature has to cover every field the till acts on, or an interceptor
  // picks the ones it left out — the floor that stops every till selling, or the
  // binary the till downloads and runs.
  check(
    "and stops verifying the moment the floor is altered",
    !verifyUpdate(
      {
        version: update.UpdateVersion!,
        minimumVersion: "9.9.9",
        downloadUrl: update.UpdateUrl!,
        sha256: update.UpdateSha256!,
      },
      update.UpdateSignature!,
      publicKey,
    ),
  );
  check(
    "or the download link",
    !verifyUpdate(
      {
        version: update.UpdateVersion!,
        minimumVersion: update.UpdateMinimumVersion!,
        downloadUrl: "https://evil.example/setup.exe",
        sha256: update.UpdateSha256!,
      },
      update.UpdateSignature!,
      publicKey,
    ),
  );

  // Refusals carry it too: a till blocked for being out of date has to learn
  // that on the very response that blocks it.
  const refused = await post("/api/activate", activateBody("ZZZZ-9999-ZZZZ-9999", deviceId()));
  checkEqual(
    "even a rejected request is told about the update",
    (JSON.parse(refused.raw) as { UpdateVersion?: string }).UpdateVersion,
    "0.4.0",
  );

  await db.appRelease.update({
    where: { id: release.id },
    data: { isPublished: false },
  });

  const withdrawn = await post("/api/checkin", checkInBody(l10.key, l10Device), {
    geo: LONDON,
    ip: LONDON_IP_A,
  });
  check(
    "withdrawing it takes the announcement away again",
    !("UpdateVersion" in (JSON.parse(withdrawn.raw) as object)),
    withdrawn.raw,
  );
}

async function teardown() {
  const shops = await db.shop.findMany({
    where: { name: { startsWith: RUN } },
    include: { licenses: true },
  });

  const licenseIds = shops.flatMap((shop) => shop.licenses.map((l) => l.id));

  // Audit rows null their license on delete rather than cascading, so they are
  // removed explicitly. Devices cascade with their license.
  await db.auditEvent.deleteMany({ where: { licenseId: { in: licenseIds } } });
  await db.shop.deleteMany({ where: { name: { startsWith: RUN } } });

  // Unknown-key attempts are recorded without a license to hang from.
  await db.auditEvent.deleteMany({
    where: { summary: { contains: "ZZZZ-9999-ZZZZ-9999" } },
  });

  // Releases are global rather than per-license, so they carry the run in
  // `notes` and are removed by that. The cache is dropped too, or a warm
  // instance would keep announcing a release that no longer exists.
  await db.appRelease.deleteMany({ where: { notes: RUN } });
}

try {
  await run();
} finally {
  await cleanUp(teardown);
  await db.$disconnect();
}

summarize("Endpoint verification");
