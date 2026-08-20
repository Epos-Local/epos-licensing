import { z } from "zod";

import { AuditEventType } from "generated/prisma";
import { customerFromSessionToken } from "~/server/customer/auth";
import { db } from "~/server/db";

/**
 * The corporate website's "Get a free quote" form, landing here instead of a
 * table local to that app — see SELF_REGISTRATION_DESIGN.md's reasoning for
 * why Shop/Customer data has exactly one home. A signed-in visitor's request
 * attaches to their existing Shop rather than creating a second one for the
 * same business; this is the whole reason quote submissions moved here.
 */

const anonymousInput = z.object({
  contactName: z.string().trim().min(1, "Your name is required.").max(120),
  businessName: z.string().trim().min(1, "Business name is required.").max(120),
  phone: z.string().trim().min(1, "Phone number is required.").max(40),
});

const quoteDetails = z.object({
  businessType: z.string().trim().max(60).optional(),
  message: z.string().trim().max(2000).optional(),
  estimateCents: z.number().int().nonnegative().optional(),
  selection: z.unknown().optional(),
});

export interface QuoteRequestResult {
  ok: boolean;
  error?: string;
}

/**
 * `sessionToken` comes from the corporate website's own first-party cookie,
 * forwarded as a bearer token on its server-to-server call here — see that
 * app's `~/server/licensing-client.ts`. Anonymous (no token, or an expired
 * one) falls back to the previous "quote form creates a Shop" behaviour.
 */
export async function submitQuoteRequest(
  input: unknown,
  sessionToken: string | null,
): Promise<QuoteRequestResult> {
  const details = quoteDetails.safeParse(input);
  if (!details.success) {
    return { ok: false, error: details.error.issues[0]?.message };
  }

  const customer = await customerFromSessionToken(sessionToken);

  let shopId: string;
  let businessName: string;

  if (customer) {
    shopId = customer.shopId;
    businessName = customer.shopName;
  } else {
    const parsed = anonymousInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message };
    }
    const shop = await db.shop.create({
      data: {
        name: parsed.data.businessName,
        contactName: parsed.data.contactName,
        phone: parsed.data.phone,
      },
    });
    shopId = shop.id;
    businessName = parsed.data.businessName;
  }

  await db.$transaction(
    async (tx) => {
      await tx.quoteRequest.create({
        data: {
          shopId,
          businessType: details.data.businessType ?? null,
          message: details.data.message ?? null,
          estimateCents: details.data.estimateCents ?? null,
          selection:
            details.data.selection === undefined ? undefined : (details.data.selection as object),
        },
      });
      await tx.auditEvent.create({
        data: {
          type: AuditEventType.quote_requested,
          actor: customer ? customer.email : "client",
          summary: `${businessName} requested a quote`,
        },
      });
    },
    { timeout: 15_000 },
  );

  return { ok: true };
}
