import {
  constants,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

import { env } from "~/env";

/**
 * The signed payload, field-for-field `Pos.Core.Domain.LicenseBlob`.
 *
 * Property order here is load-bearing: it is the C# record's declaration order,
 * which is the order `System.Text.Json` serializes in, which is the order the
 * signed bytes must be in. Do not reorder or add fields without changing the
 * client in lockstep.
 */
export interface LicenseBlob {
  LicenseKey: string;
  DeviceId: string;
  ShopLabel: string | null;
  ValidUntil: Date;
  IssuedAt: Date;
  ApprovalState: ApprovalState;
}

export type ApprovalState = "approved" | "pending" | "blocked";

/** `Pos.Core.Domain.SignedLicenseBlob` — what a `.lic` file contains verbatim. */
export interface SignedLicenseBlob {
  Payload: SerializedLicenseBlob;
  Signature: string;
}

/** A {@link LicenseBlob} with its dates already rendered in the canonical form. */
export interface SerializedLicenseBlob {
  LicenseKey: string;
  DeviceId: string;
  ShopLabel: string | null;
  ValidUntil: string;
  IssuedAt: string;
  ApprovalState: ApprovalState;
}

// ---------------------------------------------------------------------------
// Canonical serialization
// ---------------------------------------------------------------------------
//
// The client verifies against the bytes produced by:
//
//   JsonSerializer.Serialize(payload,
//       new JsonSerializerOptions { PropertyNamingPolicy = null, WriteIndented = false })
//
// so this file reproduces `System.Text.Json`'s output exactly rather than
// delegating to `JSON.stringify`, whose escaping rules differ (see below). Per
// LICENSE_FILE.md the string is assembled by hand in a fixed field order, so
// nothing about a JSON library's key ordering or whitespace defaults can drift
// out from under the signature.

/**
 * Characters `JavaScriptEncoder.Default` refuses to emit literally, over and
 * above the two JSON requires. `System.Text.Json` uses that encoder by default,
 * and it is deliberately HTML-safe: it escapes `< > & ' " +` and a backtick so
 * output can be dropped into markup or a script block unaltered.
 *
 * This is not a theoretical concern. `ShopLabel` is admin-entered free text, and
 * an apostrophe or an ampersand in a shop name ("Joe's Kebab & Grill") is the
 * common case, not the edge case. `JSON.stringify` would emit those literally,
 * the client would re-serialize them as `'` and `&`, and every
 * signature check on that license would fail.
 */
const FORBIDDEN_ASCII = new Set(["<", ">", "&", "'", '"', "+", "\\", "`"]);

/**
 * Escapes exactly as `Utf8JsonWriter` does.
 *
 * Note `"` becomes `"`, not `\"`: .NET's escape routine has a short-form
 * case for backslash, backspace, form feed, newline, carriage return and tab,
 * but not for the quote, so the quote falls through to the `\uXXXX` path. Hex
 * digits are uppercase, matching `HexConverter.Casing.Upper`.
 */
function escapeLikeSystemTextJson(value: string): string {
  let out = "";

  for (const char of value) {
    const code = char.codePointAt(0)!;

    switch (char) {
      case "\\":
        out += "\\\\";
        continue;
      case "\b":
        out += "\\b";
        continue;
      case "\f":
        out += "\\f";
        continue;
      case "\n":
        out += "\\n";
        continue;
      case "\r":
        out += "\\r";
        continue;
      case "\t":
        out += "\\t";
        continue;
    }

    // Control characters, DEL, everything outside Basic Latin (the only range
    // the default encoder allows), and the HTML-sensitive set above.
    const mustEscape =
      code < 0x20 || code === 0x7f || code > 0x7f || FORBIDDEN_ASCII.has(char);

    if (!mustEscape) {
      out += char;
      continue;
    }

    if (code > 0xffff) {
      // Astral plane: .NET is UTF-16 internally and writes the surrogate pair
      // as two separate \uXXXX escapes.
      const offset = code - 0x10000;
      out += hexEscape(0xd800 + (offset >> 10));
      out += hexEscape(0xdc00 + (offset & 0x3ff));
    } else {
      out += hexEscape(code);
    }
  }

  return out;
}

function hexEscape(code: number): string {
  return "\\u" + code.toString(16).toUpperCase().padStart(4, "0");
}

function jsonString(value: string): string {
  return `"${escapeLikeSystemTextJson(value)}"`;
}

/**
 * `System.Text.Json`'s ISO 8601-1:2019 extended profile for a `DateTime` whose
 * Kind is Utc: `yyyy-MM-ddTHH:mm:ssZ`, with fractional seconds written only when
 * non-zero.
 *
 * Everything this server issues is truncated to whole seconds so the fractional
 * part never appears, which keeps the round-trip stable: the client parses the
 * `Z` suffix back to a Utc `DateTime` and re-serializes it to a byte-identical
 * string when it verifies the cached blob on the next launch.
 */
export function toCanonicalDate(value: Date): string {
  const truncated = new Date(value.getTime());
  truncated.setUTCMilliseconds(0);
  return truncated.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Renders a blob's dates without otherwise changing it. */
export function serializeBlob(payload: LicenseBlob): SerializedLicenseBlob {
  return {
    LicenseKey: payload.LicenseKey,
    DeviceId: payload.DeviceId,
    ShopLabel: payload.ShopLabel,
    ValidUntil: toCanonicalDate(payload.ValidUntil),
    IssuedAt: toCanonicalDate(payload.IssuedAt),
    ApprovalState: payload.ApprovalState,
  };
}

/**
 * The exact bytes that get signed and verified. Both sides must go through
 * here; never re-derive this layout anywhere else.
 *
 * `ShopLabel` is emitted as `null` when absent rather than omitted, because
 * `System.Text.Json` only skips null members when told to and the client does
 * not tell it to.
 */
export function canonicalPayloadJson(payload: SerializedLicenseBlob): string {
  return (
    "{" +
    `"LicenseKey":${jsonString(payload.LicenseKey)},` +
    `"DeviceId":${jsonString(payload.DeviceId)},` +
    `"ShopLabel":${payload.ShopLabel === null ? "null" : jsonString(payload.ShopLabel)},` +
    `"ValidUntil":${jsonString(payload.ValidUntil)},` +
    `"IssuedAt":${jsonString(payload.IssuedAt)},` +
    `"ApprovalState":${jsonString(payload.ApprovalState)}` +
    "}"
  );
}

export function canonicalPayloadBytes(payload: SerializedLicenseBlob): Buffer {
  return Buffer.from(canonicalPayloadJson(payload), "utf8");
}

// ---------------------------------------------------------------------------
// Keys and signatures
// ---------------------------------------------------------------------------

/**
 * Vercel's environment UI stores multi-line values with literal `\n`, so accept
 * both that and a genuinely multi-line PEM.
 */
function normalizePem(pem: string): string {
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

let cachedPrivateKey: string | undefined;

function getPrivateKey(): string {
  cachedPrivateKey ??= normalizePem(env.LICENSE_SIGNING_PRIVATE_KEY);
  return cachedPrivateKey;
}

/**
 * The public half, in the PKCS#1 DER base64 form `RSA.ImportRSAPublicKey`
 * expects — i.e. the literal string to paste into `DevPublicKeyBase64` in the
 * client's `LicenseBlobSigning.cs`.
 *
 * Derived from the private key rather than stored separately so the two can
 * never drift apart.
 */
export function getPublicKeyPkcs1Base64(): string {
  return createPublicKey(getPrivateKey())
    .export({ type: "pkcs1", format: "der" })
    .toString("base64");
}

/** RSA-2048 / SHA-256 / PKCS#1 v1.5, matching `RSA.VerifyData` on the client. */
export function signBlob(payload: LicenseBlob): SignedLicenseBlob {
  const serialized = serializeBlob(payload);
  const signature = cryptoSign("sha256", canonicalPayloadBytes(serialized), {
    key: getPrivateKey(),
    padding: constants.RSA_PKCS1_PADDING,
  });

  return { Payload: serialized, Signature: signature.toString("base64") };
}

/**
 * A signed "what time is it" statement, for the till's staff clock.
 *
 * The POS records staff work sessions from sign-in to sign-out and pays wages
 * off them, but it is an offline single-till product whose only clock is the
 * Windows one — which a member of staff with local admin can simply wind
 * forward. The client detects a change made *while it is running* by comparing
 * against a monotonic timer, but it cannot see a change made while it is closed.
 * This gives it a reference it can trust whenever it has a network.
 *
 * Signed on its own rather than added to {@link LicenseBlob}, deliberately.
 * That blob's byte layout is load-bearing for its signature (see
 * `canonicalPayloadJson`), so adding a field would invalidate every license
 * already issued and force a lockstep client rollout. A separate signature over
 * just the timestamp is additive: old clients ignore the new response fields,
 * and new clients treat them as optional.
 *
 * Signing matters here — an unsigned timestamp (or the HTTP `Date` header)
 * would be forgeable by anything sitting between the till and this server,
 * including a hosts-file entry pointing at a machine the same member of staff
 * controls. The client verifies this with the public key it already embeds.
 */
export function signServerTime(now: Date = new Date()): {
  ServerTimeUtc: string;
  ServerTimeSignature: string;
} {
  const serverTimeUtc = toCanonicalDate(now);
  const signature = cryptoSign("sha256", Buffer.from(serverTimeUtc, "utf8"), {
    key: getPrivateKey(),
    padding: constants.RSA_PKCS1_PADDING,
  });

  return { ServerTimeUtc: serverTimeUtc, ServerTimeSignature: signature.toString("base64") };
}

/**
 * The bytes a terminal-number assignment is signed over: the device it is for,
 * then the number, joined by a character that cannot appear in either.
 *
 * The device id has to be inside the signature. Without it the assignment is
 * just a signed integer, and a signed integer lifted off one till's response and
 * replayed to another puts two tills in the same document-number block — the
 * exact failure this whole mechanism exists to prevent, achieved by replaying a
 * genuine message rather than forging one.
 */
export function canonicalTerminalNumberPayload(
  deviceId: string,
  terminalNumber: number,
): string {
  // Same separator as canonicalUpdatePayload, for the same reason: neither a
  // GUID nor a decimal integer can contain it, so the split is unambiguous.
  return [deviceId, String(terminalNumber)].join("|");
}

/**
 * Signs "this till is number N".
 *
 * Separately signed rather than added to the licence blob, for the same reason
 * as {@link signServerTime}: `canonicalPayloadJson`'s byte layout is load-bearing
 * for its own signature, so a new field there would invalidate every licence
 * already issued and force a lockstep client rollout. Additive means old clients
 * ignore this and keep using their manually-set number, which is exactly the
 * behaviour they have today.
 *
 * Unsigned, this would be worth intercepting: set every till on a licence to the
 * same number and their document numbers collide silently, which is both a
 * records problem and one nobody at the shop can see happening.
 */
export function signTerminalNumber(
  deviceId: string,
  terminalNumber: number,
): string {
  return cryptoSign(
    "sha256",
    Buffer.from(canonicalTerminalNumberPayload(deviceId, terminalNumber), "utf8"),
    { key: getPrivateKey(), padding: constants.RSA_PKCS1_PADDING },
  ).toString("base64");
}

/**
 * The bytes an update announcement is signed over: the fields joined with a
 * character that cannot appear in any of them.
 *
 * Every field is inside the signature, including the download URL and the
 * installer's hash. That is the whole point of signing this at all — the client
 * downloads and executes what these fields describe, so anything left outside
 * the signature is a field an attacker between the till and this server gets to
 * choose. Change this format and every client in the field stops accepting
 * updates until it is upgraded, which is exactly the caution it deserves.
 */
export function canonicalUpdatePayload(update: {
  version: string;
  minimumVersion: string;
  downloadUrl: string;
  sha256: string | null;
}): string {
  return [
    update.version,
    update.minimumVersion,
    update.downloadUrl,
    update.sha256 ?? "",
  ].join("|");
}

/**
 * Signs the "there is a new build" announcement carried on every licensing
 * response.
 *
 * Separately signed for the same reason as {@link signServerTime}: the licence
 * blob's byte layout is load-bearing for its own signature, so this has to be
 * additive or every licence already issued would have to be reissued.
 *
 * Unsigned, these fields would hand anyone who can intercept a till's traffic
 * two things worth having: raise `minimumVersion` and every till in the field
 * stops taking payment, or swap `downloadUrl`/`sha256` and the till installs
 * whatever they like without anyone touching the machine. Neither is a risk
 * this feature is allowed to introduce.
 */
export function signUpdate(update: {
  version: string;
  minimumVersion: string;
  downloadUrl: string;
  sha256: string | null;
}): string {
  const signature = cryptoSign(
    "sha256",
    Buffer.from(canonicalUpdatePayload(update), "utf8"),
    { key: getPrivateKey(), padding: constants.RSA_PKCS1_PADDING },
  );

  return signature.toString("base64");
}

/** {@link signUpdate}'s counterpart, so the suite can prove a round trip. */
/**
 * The verifying half of {@link signTerminalNumber}, mirroring the client's
 * `LicenseBlobSigning.VerifyTerminalNumber`. Used by the endpoint verification
 * script to prove a till is handed a block it can actually trust — and that the
 * same assignment does NOT verify for the other till on the license.
 */
export function verifyTerminalNumber(
  deviceId: string,
  terminalNumber: number,
  signatureBase64: string,
  publicKeyPkcs1Base64?: string,
): boolean {
  try {
    const key = publicKeyPkcs1Base64
      ? createPublicKey({
          key: Buffer.from(publicKeyPkcs1Base64, "base64"),
          format: "der",
          type: "pkcs1",
        })
      : createPublicKey(getPrivateKey());

    return cryptoVerify(
      "sha256",
      Buffer.from(canonicalTerminalNumberPayload(deviceId, terminalNumber), "utf8"),
      { key, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}

export function verifyUpdate(
  update: {
    version: string;
    minimumVersion: string;
    downloadUrl: string;
    sha256: string | null;
  },
  signatureBase64: string,
  publicKeyPkcs1Base64?: string,
): boolean {
  try {
    const key = publicKeyPkcs1Base64
      ? createPublicKey({
          key: Buffer.from(publicKeyPkcs1Base64, "base64"),
          format: "der",
          type: "pkcs1",
        })
      : createPublicKey(getPrivateKey());

    return cryptoVerify(
      "sha256",
      Buffer.from(canonicalUpdatePayload(update), "utf8"),
      { key, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}

/** {@link signServerTime}'s counterpart, so the suite can prove a round trip. */
export function verifyServerTime(
  serverTimeUtc: string,
  signatureBase64: string,
  publicKeyPkcs1Base64?: string,
): boolean {
  try {
    const key = publicKeyPkcs1Base64
      ? createPublicKey({
          key: Buffer.from(publicKeyPkcs1Base64, "base64"),
          format: "der",
          type: "pkcs1",
        })
      : createPublicKey(getPrivateKey());

    return cryptoVerify(
      "sha256",
      Buffer.from(serverTimeUtc, "utf8"),
      { key, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}

/**
 * The client's `LicenseBlobSigning.Verify` reimplemented here, so the test
 * suite can prove a blob this server produced is one the client will accept
 * without needing a .NET runtime in the loop.
 */
export function verifySignedBlob(
  signed: SignedLicenseBlob,
  publicKeyPkcs1Base64?: string,
): boolean {
  try {
    const key = publicKeyPkcs1Base64
      ? createPublicKey({
          key: Buffer.from(publicKeyPkcs1Base64, "base64"),
          format: "der",
          type: "pkcs1",
        })
      : createPublicKey(getPrivateKey());

    return cryptoVerify(
      "sha256",
      canonicalPayloadBytes(signed.Payload),
      { key, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(signed.Signature, "base64"),
    );
  } catch {
    // Bad base64, wrong key, malformed DER. The client collapses every failure
    // mode into a single false; so do we.
    return false;
  }
}

/**
 * The full `.lic` file body. `System.Text.Json` would serialize the outer
 * `SignedLicenseBlob` wrapper with the same encoder, so the payload is spliced
 * in as its canonical bytes rather than re-encoded by `JSON.stringify`.
 *
 * The wrapper's own formatting is not signed and the client parses it with a
 * standard reader, so only the `Payload` substring has to be exact — but
 * keeping the whole file in one style makes a hand-inspected file easier to
 * diff against what the client wrote back out via "Copy license to file".
 */
export function toLicenseFileJson(signed: SignedLicenseBlob): string {
  return (
    `{"Payload":${canonicalPayloadJson(signed.Payload)},` +
    `"Signature":${jsonString(signed.Signature)}}`
  );
}
