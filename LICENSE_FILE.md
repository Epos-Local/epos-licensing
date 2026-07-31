# License file format (.lic)

The WPF client (`pos_customized`) can activate a license two ways: a live `POST /activate` call to
this server, or by loading a `.lic` file through Settings > License > "Load license from file".
The file is the offline/manual path — useful when a shop has no direct connectivity to this
server, or when support hands a customer a file directly instead of walking them through key entry.

**This server needs a "Generate license file for a device" action** (in the admin panel, on a
license's detail view, per a specific approved device) that produces exactly the file described
below, downloadable as `<something>.lic`. This doc is the contract for that action — nothing here
is built yet on the server side; the client side (import/export) is already implemented.

## Why the DeviceId has to be known upfront

A `.lic` file is bound to one specific device the same way a live activation is — it embeds a
`DeviceId` and the client refuses to load it if that doesn't match the install's own DeviceId (see
`ImportLicenseFileAsync` in `Pos.Core/Services/LicenseService.cs`). That means generating one isn't
self-service from the admin panel alone: the customer has to first give you their DeviceId, shown
on their own Settings > License screen. Practically: customer contacts support with their DeviceId
→ you find/approve their device in the admin panel → you generate the file bound to that DeviceId →
they load it.

## File contents

Plain JSON (not encrypted — signed, so tampering is detectable but the contents aren't secret),
matching the client's `Pos.Core.Domain.SignedLicenseBlob` shape exactly:

```json
{
  "Payload": {
    "LicenseKey": "ABCD-1234-EFGH-5678",
    "DeviceId": "a1b2c3d4e5f6...",
    "ShopLabel": "Demo Kebab House",
    "ValidUntil": "2027-01-31T00:00:00Z",
    "IssuedAt": "2026-07-31T00:00:00Z",
    "ApprovalState": "approved"
  },
  "Signature": "<base64 RSA signature over the canonical bytes of Payload — see below>"
}
```

Field notes:
- `DeviceId` — the exact string the customer gave you from their Settings > License screen. A
  mismatch here is a hard rejection on load, not a soft warning.
- `ApprovalState` — normally `"approved"` for a file being handed to a customer. `"pending"`/
  `"blocked"` are valid values too (the client maps them to its ShopMismatch/Blocked states) but
  there's no real reason to generate a file in those states — the whole point of a file is to grant
  access.
- `ValidUntil`/`IssuedAt` — UTC ISO-8601 (`DateTime`, serialized by `System.Text.Json` defaults).

## Signing

The client verifies with RSA-2048 / SHA-256 / PKCS1 padding against a public key embedded in
`Pos.Core/Services/LicenseBlobSigning.cs` (`DevPublicKeyBase64` — currently a **dev/test keypair**,
not production; the matching private key lives only in `Pos.DevHarness` for local testing). This
server must sign with the matching private key once a real production keypair is generated —
at that point, swap the new public key into `LicenseBlobSigning.cs` and this doc's key stays generic
(no need to record the actual key material here).

**Critical: the bytes that get signed are the `Payload` object alone, serialized on its own** —
not the outer `{ Payload, Signature }` wrapper, and not with default `JsonSerializer` settings
without pinning them. The client computes this via:

```csharp
JsonSerializer.Serialize(payload, new JsonSerializerOptions { PropertyNamingPolicy = null, WriteIndented = false })
```

i.e. compact (no indentation), PascalCase property names exactly as declared (`LicenseKey`,
`DeviceId`, `ShopLabel`, `ValidUntil`, `IssuedAt`, `ApprovalState` — in that order, since
`JsonSerializer` serializes properties in declaration order for a POCO/record). This server's
`Payload` serialization must produce byte-for-byte the same output before signing, or every
signature check fails on the client. If this server isn't written in .NET, re-derive that exact
byte sequence in whatever language it uses rather than assuming any JSON library's default
formatting matches — safest is to build the string manually in the fixed field order above if
there's any doubt about a library's default key ordering/whitespace behavior.

Then: `signature = RSA_sign_SHA256_PKCS1(privateKey, canonicalPayloadBytes)`, base64-encoded into
the `Signature` field of the full `{ Payload, Signature }` object written to the `.lic` file.

## What "Copy license to file" produces (the other direction)

Settings > License > "Copy license to file" just writes the client's *currently cached* blob
back out unchanged (same JSON, same signature) — it's a backup/support tool, not a new
license. It never modifies or re-signs anything, so there's nothing this server needs to do to
support it.
