"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuditEventType } from "generated/prisma";
import { db } from "~/server/db";
import { customerPasswordRule, setCustomerPassword } from "~/server/customer/auth";

import { formValue, redirectWithNotice, requireAdmin } from "./shared";

const emailField = z
  .string()
  .trim()
  .email("That email address is not valid.")
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * Creating a customer always creates one Shop alongside it — every Shop
 * needs a business-identity record to attach a License to eventually, same
 * as the old "hand-type a shop" flow this replaces. Shop name defaults to
 * the customer's own name when left blank, per the design note in
 * Epos365/SUBDOMAIN_ARCHITECTURE.md.
 */
const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "A customer name is required.").max(120),
  shopName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  email: emailField,
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function createCustomerAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const parsed = createCustomerSchema.safeParse({
    name: formData.get("name"),
    shopName: formData.get("shopName") ?? undefined,
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    redirectWithNotice(
      "/shops/new",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }

  const { name, shopName, email, phone, notes } = parsed.data;

  if (email) {
    const existing = await db.customer.findUnique({ where: { email } });
    if (existing) {
      redirectWithNotice("/shops/new", `${email} is already in use by another customer.`);
    }
  }

  const { customer } = await db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: { name, email: email ?? null },
    });
    const shop = await tx.shop.create({
      data: {
        name: shopName ?? name,
        email: email ?? null,
        phone: phone ?? null,
        notes: notes ?? null,
        customerId: customer.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        type: AuditEventType.customer_created,
        actor,
        summary: `${name} added (shop: ${shop.name})`,
      },
    });
    return { customer, shop };
  });

  revalidatePath("/shops");
  redirectWithNotice(`/shops/${customer.id}`, `${customer.name} added.`, "success");
}

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, "A customer name is required.").max(120),
  email: emailField,
});

export async function updateCustomerAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = formValue(formData, "id");
  const editPath = `/shops/${id}/edit`;
  const parsed = updateCustomerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
  });

  if (!parsed.success) {
    redirectWithNotice(editPath, parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  const { name, email } = parsed.data;

  if (email) {
    const existing = await db.customer.findUnique({ where: { email } });
    if (existing && existing.id !== id) {
      redirectWithNotice(editPath, `${email} is already in use by another customer.`);
    }
  }

  const customer = await db.customer.update({
    where: { id },
    data: { name, email: email ?? null },
  });

  await db.auditEvent.create({
    data: {
      type: AuditEventType.customer_updated,
      actor,
      summary: `${customer.name ?? customer.id} updated`,
    },
  });

  revalidatePath("/shops");
  redirectWithNotice(`/shops/${customer.id}`, `${customer.name} updated.`, "success");
}

const setPasswordSchema = z.object({ password: customerPasswordRule });

/**
 * The only way `Customer.passwordHash` is set from the admin panel — always
 * goes through `setCustomerPassword`, which hashes server-side. There is no
 * form field or action anywhere that accepts a hash directly; a plaintext
 * password is the only input this ever takes.
 */
export async function setCustomerPasswordAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = formValue(formData, "id");
  const passwordPath = `/shops/${id}/password`;
  const parsed = setPasswordSchema.safeParse({ password: formValue(formData, "password") });

  if (!parsed.success) {
    redirectWithNotice(passwordPath, parsed.error.issues[0]?.message ?? "Check the password and try again.");
  }

  const result = await setCustomerPassword(id, parsed.data.password);
  if (!result.ok) {
    redirectWithNotice(passwordPath, result.error ?? "Could not set password.");
  }

  await db.auditEvent.create({
    data: {
      type: AuditEventType.customer_password_set,
      actor,
      summary: `Login password set for customer ${id}`,
    },
  });

  revalidatePath("/shops");
  redirectWithNotice(`/shops/${id}`, "Password set — this customer can now sign in.", "success");
}
