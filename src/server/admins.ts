import { hash } from "bcryptjs";
import { z } from "zod";

import { AuditEventType } from "generated/prisma";
import { db } from "~/server/db";

/**
 * Administrator accounts, as plain functions.
 *
 * The rules live here rather than in the Server Actions that call them for the
 * same reason device approval does: an action needs a request context to read
 * the session, so anything defined inside one can only be exercised through a
 * browser. Keeping the logic here lets the test suite drive it directly and
 * leaves the action to do nothing but parse a form and choose a redirect.
 *
 * Every account carries the same authority. Licensing_Design.md anticipates a
 * reseller-scoped role later; a `role` column on `User` is the change, and this
 * file is the only one that would need to know about it.
 */

/** bcrypt cost. Slow enough to matter on a stolen hash, fast enough for a login. */
export const BCRYPT_COST = 12;

/** Exported for reuse by `~/server/customer/auth` — same password/email bar for both account kinds. */
export const passwordRule = z
  .string()
  .min(12, "Use a password of at least 12 characters.")
  .max(200, "That password is too long.");

export const emailRule = z
  .string()
  .trim()
  .toLowerCase()
  .email("That is not a valid email address.");

export interface AdminResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function createAdmin(input: {
  email: string;
  name?: string | null;
  password: string;
  actor: string;
}): Promise<AdminResult> {
  const parsed = z
    .object({
      email: emailRule,
      name: z.string().trim().max(120).optional(),
      password: passwordRule,
    })
    .safeParse({
      email: input.email,
      name: input.name?.trim() ?? undefined,
      password: input.password,
    });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (existing) {
    return {
      ok: false,
      error: `${parsed.data.email} already has an account. Reset their password instead of adding them again.`,
    };
  }

  const user = await db.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      passwordHash: await hash(parsed.data.password, BCRYPT_COST),
    },
  });

  await db.auditEvent.create({
    data: {
      type: AuditEventType.admin_created,
      actor: input.actor,
      summary: `Administrator ${user.email} added`,
    },
  });

  return {
    ok: true,
    message: `${user.email} can now sign in. Send them their password over something other than email.`,
  };
}

/**
 * Sets a password without asking for the old one.
 *
 * Deliberate: the common case is a colleague who is locked out, and requiring
 * the password they have lost would defeat the purpose. Anyone who can reach
 * this already holds full authority over every license in the system, so a
 * confirmation step would be theatre rather than a control.
 */
export async function setAdminPassword(input: {
  id: string;
  password: string;
  actor: string;
}): Promise<AdminResult> {
  const parsed = passwordRule.safeParse(input.password);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const user = await db.user.findUnique({ where: { id: input.id } });
  if (!user) return { ok: false, error: "That account no longer exists." };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(parsed.data, BCRYPT_COST) },
  });

  const isSelf = user.email === input.actor;

  await db.auditEvent.create({
    data: {
      type: AuditEventType.admin_password_changed,
      actor: input.actor,
      summary: isSelf
        ? `Administrator ${user.email} changed their own password`
        : `Password reset for administrator ${user.email}`,
    },
  });

  return {
    ok: true,
    message: isSelf
      ? "Your password has been changed. Your current session stays signed in."
      : `Password reset for ${user.email}.`,
  };
}

export async function deleteAdmin(input: {
  id: string;
  actor: string;
}): Promise<AdminResult> {
  const user = await db.user.findUnique({ where: { id: input.id } });
  if (!user) return { ok: false, error: "That account no longer exists." };

  // Refusing self-removal is what guarantees an account always remains: the
  // only person who could delete the last one is its owner. It also spares
  // whoever clicks it from being signed out mid-action by their own request.
  if (user.email === input.actor) {
    return {
      ok: false,
      error:
        "You cannot remove your own account. Ask another administrator to do it.",
    };
  }

  await db.user.delete({ where: { id: user.id } });

  await db.auditEvent.create({
    data: {
      type: AuditEventType.admin_deleted,
      actor: input.actor,
      summary: `Administrator ${user.email} removed`,
    },
  });

  return { ok: true, message: `${user.email} removed.` };
}
