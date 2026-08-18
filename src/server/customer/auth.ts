import { randomBytes } from "node:crypto";

import { compare, hash } from "bcryptjs";
import { z } from "zod";

import { AuditEventType } from "generated/prisma";
import { BCRYPT_COST, emailRule } from "~/server/admins";
import { db } from "~/server/db";

/**
 * Customer accounts, as plain functions — same shape as `admins.ts`: the rules
 * live here rather than in a route handler so the test suite can drive them
 * directly. See ../../../SELF_REGISTRATION_DESIGN.md for why `Customer` is a
 * separate identity from the admin `User` model rather than a role on it.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Deliberately lower than admins.ts's 12-character bar: an admin holds
 * authority over every license in the system, a customer only their own shop,
 * and this buyer is not tech-savvy (WEBSITE_BRIEF.md §3) — 12 characters would
 * cost real signups for a threat model that doesn't justify it here.
 */
const customerPasswordRule = z
  .string()
  .min(8, "Use a password of at least 8 characters.")
  .max(200, "That password is too long.");

export interface CustomerAccount {
  id: string;
  email: string;
  name: string | null;
  shopId: string;
  shopName: string;
}

export interface CustomerAuthResult {
  ok: boolean;
  error?: string;
  token?: string;
  expires?: Date;
  customer?: CustomerAccount;
}

const registerSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required.").max(120),
  contactName: z.string().trim().max(120).optional(),
  email: emailRule,
  phone: z.string().trim().max(40).optional(),
  password: customerPasswordRule,
});

const signInSchema = z.object({
  email: emailRule,
  password: z.string().min(1, "Password is required."),
});

function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

async function createSession(customerId: string): Promise<{ token: string; expires: Date }> {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await db.customerSession.create({ data: { token, customerId, expires } });
  return { token, expires };
}

/**
 * Creates the shop owner's login and their `Shop` row — never a `License`.
 * The shop lands in the admin's existing `/shops` list and pending-review
 * posture exactly as if typed in by hand; an admin still issues the license.
 * See SELF_REGISTRATION_DESIGN.md's "What registration actually creates".
 */
export async function registerCustomer(input: unknown): Promise<CustomerAuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const { businessName, contactName, email, phone, password } = parsed.data;

  const existing = await db.customer.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: `${email} already has an account. Sign in instead.` };
  }

  // Hashed before the transaction opens: bcrypt at cost 12 is deliberately slow,
  // and doing that work while holding a pooled connection just spends the
  // transaction's timeout budget on CPU rather than queries.
  const passwordHash = await hash(password, BCRYPT_COST);

  const { customer, shop } = await db.$transaction(
    async (tx) => {
      const shop = await tx.shop.create({
        data: { name: businessName, email, phone: phone ?? null },
      });
      const customer = await tx.customer.create({
        data: {
          email,
          passwordHash,
          name: contactName ?? null,
          shopId: shop.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          type: AuditEventType.customer_registered,
          actor: "client",
          summary: `${businessName} signed up`,
        },
      });
      return { customer, shop };
    },
    // Prisma's 5s default has been observed to fail here against the Tokyo
    // pooler from a distant client; the deployed function runs in the same
    // region (vercel.json's hnd1) so this is headroom, not a fix for a
    // latency problem that exists in production.
    { timeout: 15_000 },
  );

  const session = await createSession(customer.id);

  return {
    ok: true,
    token: session.token,
    expires: session.expires,
    customer: {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      shopId: shop.id,
      shopName: shop.name,
    },
  };
}

export async function signInCustomer(input: unknown): Promise<CustomerAuthResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const { email, password } = parsed.data;

  const customer = await db.customer.findUnique({
    where: { email },
    include: { shop: true },
  });

  // Same message whether the email is unknown or the password is wrong, so a
  // caller cannot use this endpoint to enumerate registered emails.
  const invalid = { ok: false, error: "Incorrect email or password." } as const;

  if (!customer) return invalid;
  const matches = await compare(password, customer.passwordHash);
  if (!matches) return invalid;

  const session = await createSession(customer.id);

  return {
    ok: true,
    token: session.token,
    expires: session.expires,
    customer: {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      shopId: customer.shopId,
      shopName: customer.shop.name,
    },
  };
}

/** Resolves a bearer token to its customer, or null if missing/expired/unknown. */
export async function customerFromSessionToken(
  token: string | null,
): Promise<CustomerAccount | null> {
  if (!token) return null;

  const session = await db.customerSession.findUnique({
    where: { token },
    include: { customer: { include: { shop: true } } },
  });

  if (!session || session.expires < new Date()) return null;

  return {
    id: session.customer.id,
    email: session.customer.email,
    name: session.customer.name,
    shopId: session.customer.shopId,
    shopName: session.customer.shop.name,
  };
}

/** Idempotent: deleting a token that is already gone is not an error. */
export async function signOutCustomer(token: string | null): Promise<void> {
  if (!token) return;
  await db.customerSession.deleteMany({ where: { token } });
}
