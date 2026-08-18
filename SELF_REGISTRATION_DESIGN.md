# Customer self-registration — design

Scopes the self-serve signup flow the corporate website (`Epos365/epos_corporate_web`, hosted on a
separate Hostinger VPS) needs, without duplicating this repo's `Shop`/`License` data anywhere else.
Companion to `design.md` and the behavioural contract in `../pos_customized/Licensing_Design.md`,
which explicitly scoped self-serve out of v1 ("this panel is for you/the reseller, not the shop
owner") — this is that deferred v2.

**Non-goal:** this does not decide pricing, trial length, or payment. Those are still open per
`Epos365/HANDOVER.md` §6. Registration below creates an account and a `Shop` row — never a `License`
— so it needs no answer to any of that yet.

## Why this stays in this repo, not a new one

Two hard dependencies pin licensing data to this Vercel/Supabase deployment regardless of where the
marketing/SaaS front end lives:

1. Device geo-clustering reads `x-vercel-ip-*` — Vercel edge headers, absent everywhere else.
2. The `.lic` RSA signing key lives only in this Vercel project's environment.

Building a second `Customer`/`Shop`/`Subscription` model on the VPS would create two sources of truth
for the same real-world entity (a shop and its license). Instead: this repo gains a customer-facing
slice alongside its existing admin-facing one, and every other surface talks to it over HTTP — the
same relationship the WPF till already has to `/api/activate` and `/api/checkin`.

## Identity model

A new `Customer` table, **not** a role on the existing `User` table. `User` rows carry "the same
authority" over every license in the system (see its schema comment) — a customer must never be able
to reach another shop's data even in the presence of a bug, so the two identities stay structurally
separate rather than one flag away from each other.

```prisma
/// A shop owner's own login — distinct from `User` (internal admin/reseller accounts, which carry
/// authority over every license). A Customer can only ever see their own Shop.
model Customer {
    id              String    @id @default(cuid())
    email           String    @unique
    /// bcrypt hash, cost 12 — matches admins.ts's BCRYPT_COST.
    passwordHash    String
    name            String?
    emailVerifiedAt DateTime?

    /// One customer per shop for now. A second staff login for the same shop is a real future need
    /// (Licensing_Design.md's reseller-scoping precedent applies equally here) but is out of scope:
    /// widening this to a join table later is additive, narrowing a many-to-many now would not be.
    shopId String @unique
    shop   Shop   @relation(fields: [shopId], references: [id], onDelete: Cascade)

    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    sessions CustomerSession[]
}

/// Deliberately a plain DB-backed session, not a JWT and not NextAuth's own Session table (which
/// belongs to the admin User model). A stored row can be revoked by deleting it — e.g. "sign out
/// everywhere" from a compromised account — which a stateless token cannot without a denylist.
model CustomerSession {
    id         String   @id @default(cuid())
    token      String   @unique
    customerId String
    customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
    expires    DateTime
    createdAt  DateTime @default(now())
}
```

`Shop` gains the inverse relation (`customer Customer?`) and needs no other change — it is already
"deliberately minimal... just enough to make a license list human-readable," which is exactly what a
signup form produces.

## What registration actually creates

`POST /api/customer/register` creates a `Customer` + a `Shop` — **no `License`**. The new shop lands
in the admin's existing `/shops` list and pending-review posture exactly as if typed in by hand, except
correctly spelled and already linked to a login. The admin still issues the license through the panel
after (or during) the sales conversation, same flow as today. This is the smallest change that removes
the manual-typing duplication without touching `LicenseStatus`, inventing a trial tier, or anticipating
a pricing model that isn't decided.

```ts
// src/server/customers.ts — mirrors admins.ts's shape: zod input, bcrypt, one transaction.
const input = z.object({
  businessName: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120).optional(),
  email: emailRule, // reuse admins.ts's rule
  phone: z.string().trim().max(40).optional(),
  password: passwordRule, // reuse admins.ts's rule — min 12 chars
});

await db.$transaction(async (tx) => {
  const shop = await tx.shop.create({
    data: { name: businessName, email, phone },
  });
  const customer = await tx.customer.create({
    data: { email, passwordHash: await hash(password, BCRYPT_COST), name: contactName, shopId: shop.id },
  });
  await tx.auditEvent.create({
    data: { type: "customer_registered", summary: `${businessName} signed up`, actor: "client" },
  });
});
```

New `AuditEventType` value: `customer_registered`. Sign-in events are deliberately not audited —
`checkin`/`checkin_denied` already fire on every till check-in, and a customer login is comparatively
rare and low-stakes; add it later if support needs the trail.

## Endpoints

| Route | Outcome |
| --- | --- |
| `POST /api/customer/register` | 201 created · 409 email already registered · 422 validation |
| `POST /api/customer/signin` | 200 + session cookie · 401 bad credentials |
| `POST /api/customer/signout` | 200, deletes the `CustomerSession` row |
| `GET /api/customer/me` | 200 shop name, license status/expiry/device count (read-only) · 401 |

Response bodies are plain camelCase JSON — unlike `/api/activate`/`/api/checkin`, nothing here is
consumed by the WPF client's `System.Text.Json` deserializer, so there is no PascalCase constraint.

## How the VPS site should call this — server-to-server, not browser-to-browser

The corporate site's `/get-started` form should **not** call these endpoints directly from client-side
`fetch`. That would require CORS on a session-cookie-bearing endpoint (`SameSite=None; Secure`,
`Access-Control-Allow-Credentials`) across two different hosting providers — solvable, but it turns
every customer endpoint into cross-origin attack surface for no benefit.

Instead: the VPS app's existing Server Action pattern (see `epos_corporate_web/src/app/_actions/quote.ts`)
calls `POST https://<this-service-domain>/api/customer/register` **from its own Next.js server**, the
same way any backend calls another backend. No browser ever talks to this repo's origin directly. If a
session needs to persist across visits (a future "sign in" page on the VPS site), the VPS app mints its
own first-party cookie after the server-to-server call succeeds, scoped to its own domain — it does not
forward this service's session cookie to the browser.

This also means the two repos can add a shared-secret header on these routes later (an API key the VPS
server sends, checked here) without touching any browser code, if public-internet abuse of `/register`
becomes a problem.

## Open items before building

1. **Rate limiting.** `/api/customer/register` and `/signin` are unauthenticated and public the moment
   they exist. Nothing in this repo currently rate-limits (the existing endpoints are called by a
   licensed till, a different threat model). Needs at least a per-IP/per-email attempt cap — Upstash
   Redis (works from Vercel functions) or a DB-backed counter using the same IP/geo columns `Device`
   already captures. Not solved by this design; flagged so it isn't shipped without it.
2. **Email verification.** Skipping it is simplest and matches this buyer (not tech-savvy, phone-first
   per `WEBSITE_BRIEF.md` §3) but means a mistyped email locks someone out with no self-service
   recovery — same "delete the row, reseed" recovery this repo already accepts for admins might be
   acceptable here too, or a verify-by-email step might be worth the friction. Client call, not decided
   here.
3. **Migration path.** This repo currently has no `prisma/migrations` directory (`db push` only, per
   README's own noted risk for when "anyone else touches the schema"). Adding a new table with real
   customer PII data (however light) is a reasonable trigger to switch to `prisma migrate dev` now
   rather than after, per the README's own recommendation.

## What this deliberately does not do

No trial license, no payment, no plan/tier concept, no customer-facing device self-service beyond
`GET /me` (read-only). Every one of those depends on the pricing model in `HANDOVER.md` §6 that the
client hasn't set yet. This design only removes the "two places" duplication risk and gives a shop
owner a login to grow into once that's decided — it does not get ahead of it.
