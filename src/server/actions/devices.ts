"use server";

import { revalidatePath } from "next/cache";

import { db } from "~/server/db";
import {
  approveDevice,
  deactivateDeviceRow,
  rejectDevice,
} from "~/server/licensing/service";

import { formValue, redirectWithNotice, requireAdmin } from "./shared";

/**
 * The pending queue's approve/reject and the device list's deactivate.
 *
 * Each takes the originating path so the operator lands back where they were:
 * the same decision is made both from the global queue and from a license's own
 * device list, and bouncing them to a canonical page either way would lose
 * their place in the queue.
 */

export async function approveDeviceAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const { deviceRowId, returnTo } = readTarget(formData);

  const result = await approveDevice(deviceRowId, actor);

  if (!result.ok) {
    redirectWithNotice(returnTo, result.error ?? "Could not approve device.");
  }

  revalidatePath(returnTo);
  redirectWithNotice(returnTo, "Device approved.", "success");
}

export async function rejectDeviceAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const { deviceRowId, returnTo } = readTarget(formData);

  const result = await rejectDevice(deviceRowId, actor);

  if (!result.ok) {
    redirectWithNotice(returnTo, result.error ?? "Could not reject device.");
  }

  revalidatePath(returnTo);
  redirectWithNotice(returnTo, "Device rejected.", "success");
}

export async function deactivateDeviceAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireAdmin();
  const { deviceRowId, returnTo } = readTarget(formData);

  const device = await db.device.findUnique({ where: { id: deviceRowId } });
  if (!device) redirectWithNotice(returnTo, "That device no longer exists.");

  await deactivateDeviceRow(deviceRowId, actor);

  revalidatePath(returnTo);
  redirectWithNotice(
    returnTo,
    "Device deactivated. Its slot is free and its next check-in will be refused.",
    "success",
  );
}

function readTarget(formData: FormData): {
  deviceRowId: string;
  returnTo: string;
} {
  const deviceRowId = formValue(formData, "deviceRowId");
  const raw = formValue(formData, "returnTo");

  // Only ever redirect within this app: a form field is caller-controlled, and
  // an absolute URL here would turn every action into an open redirect.
  const returnTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return { deviceRowId, returnTo };
}
