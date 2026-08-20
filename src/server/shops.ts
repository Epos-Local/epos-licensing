import { z } from "zod";

import { AuditEventType } from "generated/prisma";
import { db } from "~/server/db";

/**
 * Subdomain activation for a customer's own shop — the self-serve half of
 * Milestone 1 (see ../../../Epos365/SUBDOMAIN_ARCHITECTURE.md). Registration
 * already creates the Shop; this is what turns it into a live storefront,
 * gated on `Customer.shopLimit`.
 */

const RESERVED_SUBDOMAINS = new Set(["www", "dashboard", "admin", "api", "store"]);

export const slugRule = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters.")
  .max(63, "That's too long — 63 characters max.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers, and single hyphens only.");

export type SlugCheckResult = { available: boolean; reason?: string };

/**
 * Side-effect-free — safe to call on every keystroke from the dashboard's
 * live-typing check. Does not distinguish "reserved" from "taken" in the
 * public message, so a caller can't use this to enumerate reserved words
 * beyond what's already public knowledge.
 */
export async function checkSlugAvailability(slugInput: unknown): Promise<SlugCheckResult> {
  const parsed = slugRule.safeParse(slugInput);
  if (!parsed.success) {
    return { available: false, reason: parsed.error.issues[0]?.message };
  }
  const slug = parsed.data;

  if (RESERVED_SUBDOMAINS.has(slug)) {
    return { available: false, reason: "That name isn't available." };
  }

  const existing = await db.shop.findUnique({ where: { subdomain: slug } });
  if (existing) {
    return { available: false, reason: "That name is already taken." };
  }

  return { available: true };
}

export type ActivateSubdomainResult =
  | { ok: true; subdomain: string }
  | { ok: false; error: string };

/**
 * The only place `Shop.subdomain` is ever written to a non-null value.
 * `customerId` must be the caller's own — enforced by the route handler
 * resolving it from the session token, never trusted from the request body.
 */
export async function activateSubdomain(
  customerId: string,
  shopId: string,
  slugInput: unknown,
): Promise<ActivateSubdomainResult> {
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (shop?.customerId !== customerId) {
    return { ok: false, error: "Shop not found." };
  }
  if (shop.subdomain) {
    return { ok: false, error: "This shop already has a subdomain." };
  }

  const check = await checkSlugAvailability(slugInput);
  if (!check.available) {
    return { ok: false, error: check.reason ?? "That name isn't available." };
  }
  const slug = slugRule.parse(slugInput);

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { shops: { where: { subdomain: { not: null } } } },
  });
  if (!customer) return { ok: false, error: "Customer not found." };
  if (customer.shops.length >= customer.shopLimit) {
    return {
      ok: false,
      error: "This account isn't cleared for a subdomain yet — contact support.",
    };
  }

  const updated = await db.$transaction(async (tx) => {
    // Re-checked inside the transaction: closes the race between two
    // concurrent activations both passing the availability check above for
    // the same slug.
    const clash = await tx.shop.findUnique({ where: { subdomain: slug } });
    if (clash) return null;

    const updated = await tx.shop.update({
      where: { id: shopId },
      data: { subdomain: slug, isPublished: true, publishedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        type: AuditEventType.shop_updated,
        actor: "client",
        summary: `${shop.name} activated subdomain ${slug}`,
      },
    });
    return updated;
  });

  if (!updated?.subdomain) {
    return { ok: false, error: "That name was just taken — try another." };
  }

  return { ok: true, subdomain: updated.subdomain };
}
