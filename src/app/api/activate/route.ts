import { readRequestGeo } from "~/server/licensing/geo";
import {
  activateRequestSchema,
  badRequest,
  licenseResponse,
  readJsonBody,
} from "~/server/licensing/http";
import { activateDevice } from "~/server/licensing/service";

/**
 * First-time activation for one till.
 *
 * Called by `Pos.Core.Services.LicenseService.ActivateAsync`. Outcomes, per
 * `Licensing_Design.md`:
 *
 * - 200 approved: the first device on this key, or a later one whose location
 *   clusters with the devices already approved.
 * - 202 pending: room under `maxDevices`, but the location does not match, so a
 *   human decides from the pending queue.
 * - 403 device limit: the key already has `maxDevices` approved devices. A hard
 *   cap, never a pending row.
 * - 410 blocked: the license itself is blocked, or this device was rejected.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const parsed = activateRequestSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return badRequest(
      "expected LicenseKey, DeviceId and HardwareFingerprint in the request body",
    );
  }

  const result = await activateDevice({
    licenseKey: parsed.data.licensekey,
    deviceId: parsed.data.deviceid,
    hardwareFingerprint: parsed.data.hardwarefingerprint,
    businessName: parsed.data.businessname ?? null,
    geo: readRequestGeo(request.headers),
  });

  return licenseResponse(result);
}
