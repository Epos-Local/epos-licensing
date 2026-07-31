/**
 * Drives the admin panel the way an operator does, over real HTTP with a real
 * session.
 *
 *   pnpm dev            # in one terminal
 *   pnpm verify:admin
 *
 * Where verify:endpoints covers the machine-facing contract, this covers the
 * human-facing half: that a queued device actually surfaces with the evidence
 * needed to judge it, and that the `.lic` file a customer is handed is one the
 * client will accept.
 *
 * It creates its own throwaway administrator with a random password and removes
 * it afterwards, rather than borrowing ADMIN_EMAIL / ADMIN_PASSWORD. Those are
 * bootstrap-only and meant to be deleted from the environment, so depending on
 * them would make this suite unrunnable the moment that advice was followed. It
 * also keeps a test run from touching a real operator's account.
 *
 * Fixtures are named with the run's timestamp and removed at the end.
 */

// Side-effect import, and it must stay first: it has to run before ~/server/db
// builds its client.
import "./quiet";

import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";

import { hash } from "bcryptjs";

import { db } from "~/server/db";
import { generateLicenseKey } from "~/server/licensing/license-key";
import {
  getPublicKeyPkcs1Base64,
  verifySignedBlob,
  type SerializedLicenseBlob,
} from "~/server/licensing/signing";

import { check, checkEqual, cleanUp, group, summarize } from "./harness";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const RUN = `verify-admin-${Date.now()}`;

/** The suite's own account. Created before the run, deleted after it. */
const OPERATOR_EMAIL = `${RUN}@example.invalid`;
const OPERATOR_PASSWORD = randomBytes(24).toString("base64url");

const jar = new Map<string, string>();
const cookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

function absorb(response: Response): void {
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0]!;
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}

/**
 * React separates adjacent text nodes with an empty HTML comment during server
 * rendering, so `{a} of {b}` reaches the wire as `1<!-- --> of <!-- -->2`.
 * Stripping those makes a substring assertion mean what it looks like it means.
 */
const page = async (path: string): Promise<string> => {
  const html = await (
    await fetch(`${BASE}${path}`, { headers: { cookie: cookies() } })
  ).text();
  return html.replaceAll("<!-- -->", "");
};

async function attemptSignIn(): Promise<boolean> {
  const csrfResponse = await fetch(`${BASE}/api/auth/csrf`);
  absorb(csrfResponse);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookies(),
    },
    body: new URLSearchParams({
      csrfToken,
      email: OPERATOR_EMAIL,
      password: OPERATOR_PASSWORD,
      callbackUrl: `${BASE}/`,
    }),
    redirect: "manual",
  });
  absorb(response);

  return [...jar.keys()].some((name) => name.includes("session-token"));
}

/**
 * Signs in, retrying once.
 *
 * The dev server compiles routes on demand, so running this straight after a
 * file change can hit `/api/auth/callback/credentials` while it is still
 * building and get a failure that says nothing about the credentials. One retry
 * after a pause tells a cold route apart from a genuinely wrong password.
 */
async function signIn(): Promise<boolean> {
  if (await attemptSignIn()) return true;

  jar.clear();
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return attemptSignIn();
}

function activate(
  licenseKey: string,
  deviceId: string,
  geo: { country: string; region: string; city: string },
  ip: string,
) {
  return fetch(`${BASE}/api/activate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "x-vercel-ip-country": geo.country,
      "x-vercel-ip-country-region": geo.region,
      "x-vercel-ip-city": geo.city,
    },
    body: JSON.stringify({
      LicenseKey: licenseKey,
      DeviceId: deviceId,
      HardwareFingerprint: randomBytes(32).toString("hex").toUpperCase(),
      BusinessName: null,
    }),
  });
}

const LONDON = { country: "GB", region: "ENG", city: "London" };
const PARIS = { country: "FR", region: "IDF", city: "Paris" };

async function run() {
  group("Session");

  await db.user.create({
    data: {
      email: OPERATOR_EMAIL,
      name: RUN,
      passwordHash: await hash(OPERATOR_PASSWORD, 12),
    },
  });

  const guarded = await fetch(`${BASE}/`, { redirect: "manual" });
  check(
    "an unauthenticated request to the panel is redirected to sign-in",
    guarded.status === 307 &&
      (guarded.headers.get("location") ?? "").includes("/signin"),
  );

  const signedIn = await signIn();
  check("an account stored in the database signs in", signedIn);
  if (!signedIn) {
    console.log("\n  Cannot continue without a session.");
    return;
  }

  // An apostrophe and an ampersand in the customer name, because those are the
  // characters that break canonical signing if it is done naively.
  const shop = await db.shop.create({
    data: { name: `${RUN} Joe's Kebab & Grill`, email: "joe@example.invalid" },
  });

  const validUntil = new Date();
  validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);

  const license = await db.license.create({
    data: {
      key: generateLicenseKey(),
      shopId: shop.id,
      shopLabel: "Joe's Kebab & Grill",
      maxDevices: 2,
      validUntil,
    },
  });

  const deviceA = randomBytes(16).toString("hex");
  const deviceB = randomBytes(16).toString("hex");

  await activate(license.key, deviceA, LONDON, "203.0.113.10");
  const queued = await activate(license.key, deviceB, PARIS, "192.0.2.50");

  // -------------------------------------------------------------------------
  group("Pending queue");

  checkEqual("the far device is queued", queued.status, 202);

  const queue = await page("/");
  check("the queued device is listed", queue.includes(deviceB.slice(0, 12)));
  check(
    "under the customer's name",
    queue.includes("Joe&#x27;s Kebab &amp; Grill"),
  );
  check(
    "with the location it is requesting from",
    queue.includes("Paris, IDF, FR"),
  );
  check(
    "beside the location the license is already approved at, which is the comparison the decision turns on",
    queue.includes("London, ENG, GB"),
  );

  // -------------------------------------------------------------------------
  group("License detail");

  const detail = await page(`/licenses/${license.id}`);
  check("the key is shown", detail.includes(license.key));
  check(
    "the first device is marked as the baseline",
    detail.includes("location baseline"),
  );
  check(
    "an approved device offers a license file",
    detail.includes("license-file"),
  );
  check("the device count is shown against the limit", detail.includes("of 2"));

  // -------------------------------------------------------------------------
  group("License file download");

  const rowA = await db.device.findFirstOrThrow({
    where: { licenseId: license.id, deviceId: deviceA },
  });

  const download = await fetch(
    `${BASE}/licenses/${license.id}/devices/${rowA.id}/license-file`,
    { headers: { cookie: cookies() } },
  );
  const body = await download.text();

  checkEqual("returns 200", download.status, 200);
  check(
    "as a .lic attachment",
    (download.headers.get("content-disposition") ?? "").includes(".lic"),
    download.headers.get("content-disposition") ?? "",
  );

  const parsed = JSON.parse(body) as {
    Payload: SerializedLicenseBlob;
    Signature: string;
  };

  check(
    "the signature verifies with the key compiled into the client",
    verifySignedBlob(parsed, getPublicKeyPkcs1Base64()),
  );
  checkEqual(
    "it is bound to the device it was generated for",
    parsed.Payload.DeviceId,
    deviceA,
  );
  checkEqual(
    "the shop label reads back with its apostrophe and ampersand intact",
    parsed.Payload.ShopLabel,
    "Joe's Kebab & Grill",
  );
  check(
    "because both are escaped on the wire the way System.Text.Json escapes them",
    body.includes("Joe\\u0027s Kebab \\u0026 Grill"),
  );
  checkEqual(
    "the approval state is approved",
    parsed.Payload.ApprovalState,
    "approved",
  );

  const rowB = await db.device.findFirstOrThrow({
    where: { licenseId: license.id, deviceId: deviceB },
  });
  const refused = await fetch(
    `${BASE}/licenses/${license.id}/devices/${rowB.id}/license-file`,
    { headers: { cookie: cookies() } },
  );
  checkEqual(
    "a pending device cannot be handed a file, which would bypass the queue",
    refused.status,
    409,
  );

  const anonymous = await fetch(
    `${BASE}/licenses/${license.id}/devices/${rowA.id}/license-file`,
  );
  checkEqual(
    "and an unauthenticated caller gets nothing",
    anonymous.status,
    401,
  );

  // -------------------------------------------------------------------------
  group("License file for an offline device");

  // The shop this path exists for never reaches the server, so its till never
  // appears in the device list and the per-row link above can never serve it.
  // Support types the id in instead.
  const offlineDevice = randomBytes(16).toString("hex");

  // Entered the way support actually receives it: hyphenated and upper case.
  const asTyped = offlineDevice
    .toUpperCase()
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

  const issueFile = (deviceId: string, authenticated = true) =>
    fetch(`${BASE}/licenses/${license.id}/license-file`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(authenticated ? { cookie: cookies() } : {}),
      },
      body: new URLSearchParams({ deviceId }),
      redirect: "manual",
    });

  const offline = await issueFile(asTyped);
  checkEqual("a never-seen device is issued a file", offline.status, 200);

  const offlineBody = await offline.text();
  const offlineParsed = JSON.parse(offlineBody) as {
    Payload: SerializedLicenseBlob;
    Signature: string;
  };

  check(
    "the file verifies with the key compiled into the client",
    verifySignedBlob(offlineParsed, getPublicKeyPkcs1Base64()),
  );
  checkEqual(
    "hyphens and capitals are normalised to the id the till actually stores",
    offlineParsed.Payload.DeviceId,
    offlineDevice,
  );
  checkEqual(
    "the device is enrolled as approved, so the file counts against the cap",
    (
      await db.device.findUnique({
        where: {
          licenseId_deviceId: {
            licenseId: license.id,
            deviceId: offlineDevice,
          },
        },
      })
    )?.status,
    "approved",
  );

  const approvedBefore = await db.device.count({
    where: { licenseId: license.id, status: "approved" },
  });
  const again = await issueFile(offlineDevice);
  checkEqual("regenerating for the same device works", again.status, 200);
  checkEqual(
    "and does not consume a second slot",
    await db.device.count({
      where: { licenseId: license.id, status: "approved" },
    }),
    approvedBefore,
  );

  const malformed = await issueFile("not-a-device-id");
  check(
    "a mistyped id is refused rather than signed into a file that can never load",
    malformed.status === 303 &&
      (malformed.headers.get("location") ?? "").includes("notice="),
    `status ${malformed.status}`,
  );

  const overCap = await issueFile(randomBytes(16).toString("hex"));
  check(
    "the device cap blocks a file beyond the limit",
    overCap.status === 303 &&
      decodeURIComponent(overCap.headers.get("location") ?? "").includes(
        "Deactivate one",
      ),
    decodeURIComponent(overCap.headers.get("location") ?? ""),
  );

  const queuedFile = await issueFile(deviceB);
  check(
    "and a pending device is sent to the queue rather than handed a file",
    queuedFile.status === 303 &&
      decodeURIComponent(queuedFile.headers.get("location") ?? "").includes(
        "pending",
      ),
    decodeURIComponent(queuedFile.headers.get("location") ?? ""),
  );

  const unauthenticatedIssue = await issueFile(offlineDevice, false);
  checkEqual(
    "an unauthenticated caller gets nothing",
    unauthenticatedIssue.status,
    401,
  );

  check(
    "no .lic file is left on the server; it is signed in memory and streamed",
    !readdirSync(process.cwd()).some((entry) => entry.endsWith(".lic")),
  );

  // -------------------------------------------------------------------------
  group("Administrator accounts");

  const colleagueEmail = `${RUN}-colleague@example.invalid`;
  const colleaguePassword = randomBytes(24).toString("base64url");

  const adminsPage = await page("/admins");
  check(
    "the page lists the signed-in account",
    adminsPage.includes(OPERATOR_EMAIL),
  );

  // Driven through the service the forms delegate to, not the Server Actions
  // themselves: an action reads the session from the request context, so it
  // cannot run outside a browser. The action layer is a form parse and a
  // redirect over these functions, and the page render plus the sign-in below
  // cover the HTTP either side.
  const { createAdmin, deleteAdmin, setAdminPassword } =
    await import("~/server/admins");

  const created = await createAdmin({
    email: colleagueEmail,
    name: "Colleague",
    password: colleaguePassword,
    actor: OPERATOR_EMAIL,
  });
  check("a second account can be created", created.ok, created.error);

  const colleague = await db.user.findUnique({
    where: { email: colleagueEmail },
  });
  check("it is stored in the database", colleague !== null);
  check(
    "with a bcrypt hash rather than the password",
    Boolean(colleague?.passwordHash?.startsWith("$2")) &&
      !colleague?.passwordHash?.includes(colleaguePassword),
  );

  // The point of the whole change: a second person can actually sign in.
  const secondJar = new Map<string, string>();
  const secondCsrf = await fetch(`${BASE}/api/auth/csrf`);
  for (const c of secondCsrf.headers.getSetCookie()) {
    const p = c.split(";")[0]!;
    secondJar.set(p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1));
  }
  const { csrfToken: secondToken } = (await secondCsrf.json()) as {
    csrfToken: string;
  };
  const secondLogin = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: [...secondJar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: new URLSearchParams({
      csrfToken: secondToken,
      email: colleagueEmail,
      password: colleaguePassword,
      callbackUrl: `${BASE}/`,
    }),
    redirect: "manual",
  });
  check(
    "the new account signs in independently",
    secondLogin.headers.getSetCookie().some((c) => c.includes("session-token")),
    secondLogin.headers.get("location") ?? "",
  );

  const duplicate = await createAdmin({
    email: colleagueEmail,
    name: "Again",
    password: randomBytes(24).toString("base64url"),
    actor: OPERATOR_EMAIL,
  });
  check(
    "a duplicate email is refused",
    !duplicate.ok && (duplicate.error ?? "").includes("already has an account"),
    duplicate.error,
  );

  const weak = await createAdmin({
    email: `${RUN}-weak@example.invalid`,
    name: "",
    password: "short",
    actor: OPERATOR_EMAIL,
  });
  check(
    "a short password is refused",
    !weak.ok && (weak.error ?? "").includes("12 characters"),
    weak.error,
  );
  checkEqual(
    "and no account is created for it",
    await db.user.count({ where: { email: `${RUN}-weak@example.invalid` } }),
    0,
  );

  const oldHash = colleague?.passwordHash;
  const reset = await setAdminPassword({
    id: colleague!.id,
    password: randomBytes(24).toString("base64url"),
    actor: OPERATOR_EMAIL,
  });
  check("a colleague's password can be reset", reset.ok, reset.error);
  check(
    "which actually changes the stored hash",
    (await db.user.findUnique({ where: { id: colleague!.id } }))
      ?.passwordHash !== oldHash,
  );

  const self = await db.user.findUniqueOrThrow({
    where: { email: OPERATOR_EMAIL },
  });
  const selfDelete = await deleteAdmin({ id: self.id, actor: OPERATOR_EMAIL });
  check(
    "removing your own account is refused, which is what keeps one account alive",
    !selfDelete.ok &&
      (selfDelete.error ?? "").includes("cannot remove your own"),
    selfDelete.error,
  );
  checkEqual(
    "and the account survives",
    await db.user.count({ where: { email: OPERATOR_EMAIL } }),
    1,
  );

  const removed = await deleteAdmin({
    id: colleague!.id,
    actor: OPERATOR_EMAIL,
  });
  check("a colleague can be removed", removed.ok, removed.error);
  checkEqual(
    "and is gone from the database",
    await db.user.count({ where: { email: colleagueEmail } }),
    0,
  );

  const adminAudit = await page("/audit");
  check(
    "account changes are recorded in the audit log",
    adminAudit.includes("Administrator") && adminAudit.includes("added"),
  );

  // -------------------------------------------------------------------------
  group("Audit log");

  const audit = await page("/audit");
  check(
    "records the file generation",
    audit.includes("License file generated"),
  );
  check(
    "records why the first device was auto-approved",
    audit.includes("auto-approved"),
  );
  check("records why the second was held", audit.includes("held for review"));
}

async function teardown() {
  const shops = await db.shop.findMany({
    where: { name: { startsWith: RUN } },
    include: { licenses: true },
  });
  const licenseIds = shops.flatMap((shop) => shop.licenses.map((l) => l.id));

  await db.auditEvent.deleteMany({ where: { licenseId: { in: licenseIds } } });
  await db.shop.deleteMany({ where: { name: { startsWith: RUN } } });

  // The suite's own account and its colleague, plus the audit rows naming them.
  // Matched on this run's id so a real operator's account is never in scope.
  await db.user.deleteMany({ where: { email: { contains: RUN } } });
  await db.auditEvent.deleteMany({ where: { summary: { contains: RUN } } });
}

try {
  await run();
} finally {
  await cleanUp(teardown);
  await db.$disconnect();
}

summarize("Admin panel verification");
