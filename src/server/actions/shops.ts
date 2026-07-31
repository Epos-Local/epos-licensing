"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuditEventType } from "generated/prisma";
import { db } from "~/server/db";

import { formValue, redirectWithNotice, requireAdmin } from "./shared";

/**
 * Customers, kept to what makes a license list readable and supportable. No
 * billing, no tickets, no notes beyond a free-text line, per the design doc's
 * "not a full CRM" scope.
 */
const shopSchema = z.object({
  name: z.string().trim().min(1, "A business name is required."),
  email: z
    .string()
    .trim()
    .email("That email address is not valid.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function createShopAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const parsed = shopSchema.safeParse(readShopForm(formData));

  if (!parsed.success) {
    redirectWithNotice(
      "/shops",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }

  const shop = await db.shop.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      notes: parsed.data.notes ?? null,
    },
  });

  await db.auditEvent.create({
    data: {
      type: AuditEventType.shop_created,
      actor,
      summary: `Customer ${shop.name} added`,
    },
  });

  revalidatePath("/shops");
  redirectWithNotice("/shops", `${shop.name} added.`, "success");
}

export async function updateShopAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = formValue(formData, "id");
  const parsed = shopSchema.safeParse(readShopForm(formData));

  if (!parsed.success) {
    redirectWithNotice(
      "/shops",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }

  const shop = await db.shop.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      notes: parsed.data.notes ?? null,
    },
  });

  await db.auditEvent.create({
    data: {
      type: AuditEventType.shop_updated,
      actor,
      summary: `Customer ${shop.name} updated`,
    },
  });

  revalidatePath("/shops");
  redirectWithNotice("/shops", `${shop.name} updated.`, "success");
}

function readShopForm(formData: FormData) {
  return {
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  };
}
