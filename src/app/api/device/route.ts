import { auth } from "~/server/auth";
import {
  badRequest,
  deviceDeleteRequestSchema,
  readJsonBody,
} from "~/server/licensing/http";
import { deactivateDevice } from "~/server/licensing/service";

/**
 * Releases a device's slot under `maxDevices`, for the hardware-swap case.
 *
 * `Licensing_Design.md` marks this admin-panel-only and explicitly not called
 * by the client app, so unlike /activate and /checkin it requires an
 * authenticated admin session. The panel's own device actions call
 * `deactivateDeviceRow` directly through a Server Action; this endpoint exists
 * so the documented contract is actually reachable over HTTP for scripting and
 * support tooling.
 */
export const dynamic = "force-dynamic";

export async function DELETE(request: Request): Promise<Response> {
  const session = await auth();

  if (!session?.user?.email) {
    return json({ ok: false, error: "authentication required" }, 401);
  }

  const parsed = deviceDeleteRequestSchema.safeParse(
    await readJsonBody(request),
  );

  if (!parsed.success) {
    return badRequest("expected LicenseKey and DeviceId in the request body");
  }

  const result = await deactivateDevice({
    licenseKey: parsed.data.licensekey,
    deviceId: parsed.data.deviceid,
    actor: session.user.email,
  });

  return json(result, result.ok ? 200 : 404);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
