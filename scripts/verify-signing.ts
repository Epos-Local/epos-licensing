/**
 * Proves this server signs blobs the WPF client will actually accept.
 *
 *   pnpm verify:signing
 *
 * Needs no database and no running server: everything here is the byte layout
 * and the signature, which is where a mismatch would be silent. A wrong byte
 * does not throw anywhere; it just makes `LicenseBlobSigning.Verify` return
 * false on the customer's till, and the customer sees "this license file is
 * invalid or has been tampered with" with no clue why.
 *
 * The reference behaviour being reproduced is:
 *
 *   JsonSerializer.Serialize(payload,
 *       new JsonSerializerOptions { PropertyNamingPolicy = null, WriteIndented = false })
 *
 * as called by `Pos.Core/Services/LicenseBlobSigning.CanonicalBytes`.
 */

import {
  canonicalPayloadJson,
  getPublicKeyPkcs1Base64,
  serializeBlob,
  signBlob,
  toLicenseFileJson,
  verifySignedBlob,
  type SerializedLicenseBlob,
} from "~/server/licensing/signing";

import { check, checkEqual, group, summarize } from "./harness";

const publicKey = getPublicKeyPkcs1Base64();

// ---------------------------------------------------------------------------

group("Canonical byte layout");

const example = serializeBlob({
  LicenseKey: "ABCD-1234-EFGH-5678",
  DeviceId: "a1b2c3d4e5f6",
  ShopLabel: "Demo Kebab House",
  ValidUntil: new Date("2027-01-31T00:00:00Z"),
  IssuedAt: new Date("2026-07-31T00:00:00Z"),
  ApprovalState: "approved",
});

checkEqual(
  "matches the LICENSE_FILE.md example byte for byte",
  canonicalPayloadJson(example),
  '{"LicenseKey":"ABCD-1234-EFGH-5678","DeviceId":"a1b2c3d4e5f6",' +
    '"ShopLabel":"Demo Kebab House","ValidUntil":"2027-01-31T00:00:00Z",' +
    '"IssuedAt":"2026-07-31T00:00:00Z","ApprovalState":"approved"}',
);

check(
  "field order is the C# record's declaration order",
  /^\{"LicenseKey":.*"DeviceId":.*"ShopLabel":.*"ValidUntil":.*"IssuedAt":.*"ApprovalState":.*\}$/.test(
    canonicalPayloadJson(example),
  ),
);

check(
  "no whitespace anywhere",
  !/[\n\r\t]|": | :/.test(canonicalPayloadJson(example)),
);

const nullLabel = serializeBlob({
  ...blobInput(),
  ShopLabel: null,
});

check(
  "a null ShopLabel is written, not omitted",
  canonicalPayloadJson(nullLabel).includes('"ShopLabel":null'),
  canonicalPayloadJson(nullLabel),
);

// ---------------------------------------------------------------------------

group("System.Text.Json string escaping");

// JsonSerializer's default JavaScriptEncoder is HTML-safe, so these characters
// never appear literally in .NET's output. JSON.stringify would emit them as
// themselves, and every signature over a shop name containing an apostrophe
// would fail on the client.
const awkward = serializeBlob({
  ...blobInput(),
  ShopLabel: "Joe's Kebab & Grill <Ltd> + Café",
});

checkEqual(
  "escapes apostrophe, ampersand, angle brackets, plus and non-ASCII",
  extractShopLabel(canonicalPayloadJson(awkward)),
  "Joe\\u0027s Kebab \\u0026 Grill \\u003CLtd\\u003E \\u002B Caf\\u00E9",
);

const quoted = serializeBlob({ ...blobInput(), ShopLabel: 'The "Best" Kebab' });

checkEqual(
  'a double quote is \\u0022, not \\" (.NET has no short form for it)',
  extractShopLabel(canonicalPayloadJson(quoted)),
  "The \\u0022Best\\u0022 Kebab",
);

const backslash = serializeBlob({ ...blobInput(), ShopLabel: "A\\B\tC" });

checkEqual(
  "backslash and tab use their short forms",
  extractShopLabel(canonicalPayloadJson(backslash)),
  "A\\\\B\\tC",
);

const escapes = canonicalPayloadJson(awkward).match(/\\u[0-9a-fA-F]{4}/g) ?? [];

check(
  "hex digits are upper case, matching HexConverter.Casing.Upper",
  escapes.length > 0 &&
    escapes.every((esc) => esc.slice(2) === esc.slice(2).toUpperCase()),
  escapes.join(" "),
);

// ---------------------------------------------------------------------------

group("Date rendering");

const fractional = serializeBlob({
  ...blobInput(),
  ValidUntil: new Date("2027-01-31T09:30:45.123Z"),
});

checkEqual(
  "milliseconds are truncated, so the fractional part never appears",
  fractional.ValidUntil,
  "2027-01-31T09:30:45Z",
);

check(
  "a Z suffix is used, which parses back to DateTimeKind.Utc on the client",
  fractional.ValidUntil.endsWith("Z") && !fractional.ValidUntil.includes("+"),
);

// ---------------------------------------------------------------------------

group("Signature");

const signed = signBlob({
  LicenseKey: "ABCD-1234-EFGH-5678",
  DeviceId: "9f8e7d6c5b4a39281706",
  ShopLabel: "Joe's Kebab & Grill",
  ValidUntil: new Date("2027-01-31T00:00:00Z"),
  IssuedAt: new Date("2026-07-31T00:00:00Z"),
  ApprovalState: "approved",
});

check(
  "verifies against the PKCS#1 public key that goes into LicenseBlobSigning.cs",
  verifySignedBlob(signed, publicKey),
);

check(
  "the signature is base64",
  /^[A-Za-z0-9+/]+={0,2}$/.test(signed.Signature),
);

checkEqual(
  "RSA-2048 produces a 256 byte signature",
  Buffer.from(signed.Signature, "base64").length,
  256,
);

// The client parses the file, then re-serializes the parsed payload through its
// own CanonicalBytes before verifying. Anything that survives JSON but changes
// the bytes on the way back out breaks the signature. This reproduces that
// exact round trip.
const reparsed = JSON.parse(
  canonicalPayloadJson(signed.Payload),
) as SerializedLicenseBlob;

checkEqual(
  "re-serializing the parsed payload reproduces the signed bytes",
  canonicalPayloadJson(reparsed),
  canonicalPayloadJson(signed.Payload),
);

check(
  "so the signature still verifies after a parse and re-serialize",
  verifySignedBlob(
    { Payload: reparsed, Signature: signed.Signature },
    publicKey,
  ),
);

check(
  "a tampered ValidUntil fails verification",
  !verifySignedBlob(
    {
      Payload: { ...signed.Payload, ValidUntil: "2099-01-01T00:00:00Z" },
      Signature: signed.Signature,
    },
    publicKey,
  ),
);

check(
  "a tampered ShopLabel fails verification",
  !verifySignedBlob(
    {
      Payload: { ...signed.Payload, ShopLabel: "Someone Else" },
      Signature: signed.Signature,
    },
    publicKey,
  ),
);

check(
  "a signature from a different key fails verification",
  !verifySignedBlob(
    {
      Payload: signed.Payload,
      Signature: Buffer.alloc(256, 7).toString("base64"),
    },
    publicKey,
  ),
);

check(
  "malformed base64 fails rather than throwing",
  !verifySignedBlob(
    { Payload: signed.Payload, Signature: "not base64 !!" },
    publicKey,
  ),
);

// ---------------------------------------------------------------------------

group(".lic file");

const fileBody = toLicenseFileJson(signed);
const parsedFile = JSON.parse(fileBody) as {
  Payload: SerializedLicenseBlob;
  Signature: string;
};

checkEqual(
  "the file has exactly the two members SignedLicenseBlob declares",
  Object.keys(parsedFile).join(","),
  "Payload,Signature",
);

checkEqual(
  "the payload has exactly the six members LicenseBlob declares, in order",
  Object.keys(parsedFile.Payload).join(","),
  "LicenseKey,DeviceId,ShopLabel,ValidUntil,IssuedAt,ApprovalState",
);

check(
  "the file verifies after the parse ImportLicenseFileAsync performs",
  verifySignedBlob(
    { Payload: parsedFile.Payload, Signature: parsedFile.Signature },
    publicKey,
  ),
);

checkEqual(
  "DeviceId survives the round trip, which is what the client binds against",
  parsedFile.Payload.DeviceId,
  "9f8e7d6c5b4a39281706",
);

// The client re-exports its cached blob verbatim through "Copy license to
// file". Feeding the file back through the writer proves that export is
// byte-identical to what was originally handed over.
checkEqual(
  "re-emitting the parsed file reproduces it byte for byte",
  toLicenseFileJson({
    Payload: parsedFile.Payload,
    Signature: parsedFile.Signature,
  }),
  fileBody,
);

// ---------------------------------------------------------------------------

group("Public key hand-off");

checkEqual(
  "the key is 360 base64 characters, the same shape as the dev key it replaces",
  publicKey.length,
  360,
);

check(
  "it decodes to a 270 byte PKCS#1 RSAPublicKey structure",
  Buffer.from(publicKey, "base64").length === 270,
);

summarize("Signing verification");

console.log(
  "\nPublic key for Pos.Core/Services/LicenseBlobSigning.cs (DevPublicKeyBase64):\n",
);
console.log(publicKey);

// ---------------------------------------------------------------------------

function blobInput() {
  return {
    LicenseKey: "ABCD-1234-EFGH-5678",
    DeviceId: "a1b2c3d4e5f6",
    ShopLabel: "Demo Kebab House",
    ValidUntil: new Date("2027-01-31T00:00:00Z"),
    IssuedAt: new Date("2026-07-31T00:00:00Z"),
    ApprovalState: "approved" as const,
  };
}

/** Pulls the raw, still-escaped ShopLabel out of a canonical payload string. */
function extractShopLabel(json: string): string {
  return /"ShopLabel":"((?:[^"\\]|\\.)*)"/.exec(json)?.[1] ?? "<not found>";
}
