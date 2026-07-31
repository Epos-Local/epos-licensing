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
