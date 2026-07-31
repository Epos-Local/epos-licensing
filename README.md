# epos-licensing

The shop-locked license server and admin panel for the EPos 365 WPF POS client.

A license is sold for one shop and a fixed number of tills. The client half of
this lives in `pos_customized` and is already built; this repository is the
server it talks to. The behavioural contract is
`../pos_customized/Licensing_Design.md`, the `.lic` file format is
`LICENSE_FILE.md`, and the admin panel's visual system is `design.md`. Those
three documents are the specification; this README is only how to run it.

## What it does

Two mechanisms, deliberately independent, which together make "one shop, two
tills" hold:

- **A hard device cap per license.** The first till to activate is approved
  automatically and becomes the license's location baseline. Once `maxDevices`
  devices are approved, further activations are refused outright with 403. This
  is deterministic and never reaches a human.
- **Location clustering for everything under the cap.** A second till whose
  request comes from the same country and region as an approved device, or from
  the same IPv4 /24, is approved automatically. One that does not match is held
  in a pending queue for a person to judge. This is what catches a database
  copied to a different shop, which is the case the whole feature exists for.

A request with no usable location never auto-approves. An unconfirmable location
goes to the queue rather than through it.

### Why Vercel specifically

Location comes from the `x-vercel-ip-*` headers the edge network attaches before
the function runs. That makes the one external input the shop-locking mechanism
depends on free, instant, and unspoofable by the client. A third-party GeoIP
service would put a paid network round trip inside every activation and
check-in, and an outage there would either block activations or force a
fail-open that silently disables the check. Off Vercel the headers are simply
absent, and every second device lands in the queue.

## Setup

```bash
pnpm install
cp .env.example .env      # then fill it in, see below
pnpm db:push              # creates the schema
pnpm db:seed              # creates the single admin login
pnpm dev
```

`.env` needs:

| Variable | Notes |
| --- | --- |
| `AUTH_SECRET` | `npx auth secret` |
| `DATABASE_URL` | Supabase **transaction** pooler, port 6543, `?pgbouncer=true` |
| `DIRECT_URL` | Supabase **session** pooler, port 5432. Prisma needs it for DDL; the transaction pooler cannot run migrations |
| `LICENSE_SIGNING_PRIVATE_KEY` | PKCS#8 PEM, see below. Secret |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstrap-only, see below. Delete after the first `db:seed` |

### Administrator accounts

Accounts live in the `User` table and are managed from the panel's
**Administrators** page: add a colleague, reset a password, remove someone. Any
administrator can do all three, since they already hold full authority over
every license.

`ADMIN_EMAIL` and `ADMIN_PASSWORD` exist only to create the *first* account,
because nobody can reach the page that adds accounts until somebody can sign in.
`pnpm db:seed` refuses to touch anything once an account exists, so a stale
password left in an environment cannot silently reset one that has since been
changed. Nothing reads either variable at runtime; delete them after the first
run.

Passwords are bcrypt at cost 12. There is no invitation email and no
self-service sign-up: whoever adds an account sets the password and passes it on
out of band. Removing your own account is refused, which is what guarantees one
always remains — the only person who could delete the last account is its owner.

Lost the only password? Delete the row from the `User` table and run
`pnpm db:seed` again.

## The signing key

Licenses are signed RSA-2048 / SHA-256 / PKCS#1 v1.5. The client verifies
against a public key compiled into `Pos.Core/Services/LicenseBlobSigning.cs`.

```bash
pnpm keypair
```

prints both halves: the private key to put in the environment, and the public
key to paste into `LicenseBlobSigning.cs` as `DevPublicKeyBase64`, replacing the
dev key. That paste is a manual, one-time hand-off. The public key is emitted as
PKCS#1 DER base64, which is what `RSA.ImportRSAPublicKey` consumes;
SubjectPublicKeyInfo, the other common encoding, would not load.

The private key belongs in the Vercel and Supabase environment only. It is never
committed, never logged, and never surfaced in the panel. Regenerating it after
launch invalidates every license already issued.

## Canonical serialization

The single most breakable thing here. The client verifies against the bytes
produced by

```csharp
JsonSerializer.Serialize(payload,
    new JsonSerializerOptions { PropertyNamingPolicy = null, WriteIndented = false })
```

so `src/server/licensing/signing.ts` reproduces `System.Text.Json` exactly rather
than delegating to `JSON.stringify`: fixed field order, PascalCase, no
whitespace, nulls written rather than omitted, dates truncated to whole seconds,
and .NET's HTML-safe escaping. That last one is not academic. `ShopLabel` is
admin-entered, and an apostrophe or ampersand in a shop name is the common case;
`.NET` writes those as `'` and `&`, and a signature computed over the
literal characters fails on every till.

A mismatch is silent. Nothing throws; the customer just sees "this license file
is invalid or has been tampered with". `pnpm verify:signing` is what stands
between a change here and that outcome.

## Endpoints

Called by `Pos.Core.Services.LicenseService`. Bodies and responses are PascalCase
because the client deserializes with `System.Text.Json`'s defaults, where
`PropertyNameCaseInsensitive` is false — a camelCase response would bind to
nothing and read as an empty approval state. Requests are accepted in either
case.

| Route | Outcomes |
| --- | --- |
| `POST /api/activate` | 200 approved · 202 pending · 403 device limit · 410 blocked · 404 unknown key |
| `POST /api/checkin` | 200 approved · 202 pending · 410 blocked, rejected, deactivated or unknown device |
| `DELETE /api/device` | Admin session required. Frees a slot |

A device refused for exceeding the cap gets no database row at all, so the
pending queue stays a pure location-review queue.

## Admin panel

Server Components and Server Actions throughout; no client components. Sign-in is
a single Credentials account.

- `/` — the pending approval queue, and the landing page, because it is the only
  thing in the system that needs a human. Each row puts the requesting location
  beside the license's already-approved location so the decision is read rather
  than reconstructed.
- `/licenses` — issued licenses, those needing attention first
- `/licenses/[id]` — terms, devices, `.lic` generation, block/unblock, key
  regeneration, history
- `/shops` — customers
- `/audit` — the append-only feed

The visual system is Vercel's brand foundation, vendored byte-identical at
`public/vercel-brand.css` so the panel has no third-party runtime dependency;
refresh it from `https://vercel.com/geist/vercel-brand.css`. The identity slot
names EPos 365 rather than carrying the Vercel wordmark, since this is a vendor's
internal tool and not a Vercel-authored surface. Tailwind is installed but not
imported: its preflight would fight the foundation for the same elements.

## Verification

```bash
pnpm verify:signing      # no database, no server
pnpm dev                 # the two below need it running
pnpm verify:endpoints
pnpm verify:admin        # needs ADMIN_EMAIL / ADMIN_PASSWORD still set
pnpm verify              # all three
```

105 checks covering first activation, same-location and same-subnet
auto-approval, a location mismatch reaching the queue and being approved or
rejected, the device cap as a hard 403 that writes no row and outranks the
location check, the cap also binding an operator approving from the queue, slot
release and reuse, blocked licenses, unknown keys and devices, signature
verification against the client's own public key, tamper detection, and a `.lic`
file round-tripping through the parse `ImportLicenseFileAsync` performs.

Location is simulated by sending the `x-vercel-ip-*` headers the edge network
would attach, which is the only way to reach the clustering logic without two
machines in two cities. Fixtures are named with the run's timestamp and removed
afterwards.

## Connection handling

Supabase's transaction pooler closes connections it considers idle while Prisma
keeps them in its own pool, so the first query after a quiet period can fail
with "Can't reach database server" against a perfectly healthy database.

`src/server/db.ts` retries those. The retry is scoped to
`PrismaClientInitializationError` alone, which is raised while opening the
connection and therefore proves the statement never executed, so replaying it
cannot duplicate a write. Errors like `P1017`, where the server closed an
established connection and an insert may or may not have committed, are
deliberately not retried.

## Deployment

Vercel, with the same environment variables. `DIRECT_URL` is only needed where
migrations run. Route handlers use the Node runtime because they need
`node:crypto`; do not move them to the edge.

Supabase recommends appending `&connection_limit=1` to `DATABASE_URL` for
serverless deployments, so each function instance holds one pooled connection
rather than competing for the project's shared budget. Worth adding when this
goes to Vercel.
