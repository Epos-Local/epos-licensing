"use server";

import { revalidatePath } from "next/cache";

import { createAdmin, deleteAdmin, setAdminPassword } from "~/server/admins";

import { formValue, redirectWithNotice, requireAdmin } from "./shared";

/**
 * Form plumbing for the Administrators page. The rules and the audit trail live
 * in `~/server/admins`, which is where they can be tested without a browser.
 */

export async function createAdminAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const result = await createAdmin({
    email: formValue(formData, "email"),
    name: formValue(formData, "name") || null,
    password: formValue(formData, "password"),
    actor,
  });

  finish(result);
}

export async function setAdminPasswordAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireAdmin();

  const result = await setAdminPassword({
    id: formValue(formData, "id"),
    password: formValue(formData, "password"),
    actor,
  });

  finish(result);
}

export async function deleteAdminAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const result = await deleteAdmin({ id: formValue(formData, "id"), actor });

  finish(result);
}

function finish(result: {
  ok: boolean;
  error?: string;
  message?: string;
}): never {
  if (!result.ok) {
    redirectWithNotice("/admins", result.error ?? "That did not work.");
  }

  revalidatePath("/admins");
  redirectWithNotice("/admins", result.message ?? "Done.", "success");
}
