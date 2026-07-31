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
  rejectDevice,
} from "~/server/licensing/service";
import {
  getPublicKeyPkcs1Base64,
  verifySignedBlob,
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
}

try {
  await run();
} finally {
  await cleanUp(teardown);
  await db.$disconnect();
}

summarize("Endpoint verification");
