import { readRequestGeo } from "~/server/licensing/geo";
import {
  badRequest,
  checkInRequestSchema,
  licenseResponse,
  readJsonBody,
} from "~/server/licensing/http";
import { checkInDevice } from "~/server/licensing/service";

/**
 * Periodic revalidation for a device that has already been through /activate.
 *
 * Called by `LicenseService.CheckInAsync`, which is fired and forgotten at
 * startup and tolerates an unreachable server, so this handler is never on a
 * blocking path for the till. It refreshes the device's location and liveness
 * columns and re-issues a freshly signed blob, which is what resets the
 * client's 14-day offline grace clock.
 *
 * No approval decision is made here. A device the geo check has never cleared
 * stays pending until a human acts on it; checking in repeatedly is not a way
 * to age out of the queue.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const parsed = checkInRequestSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return badRequest(
      "expected LicenseKey, DeviceId and HardwareFingerprint in the request body",
    );
  }

  const result = await checkInDevice({
    licenseKey: parsed.data.licensekey,
    deviceId: parsed.data.deviceid,
    hardwareFingerprint: parsed.data.hardwarefingerprint,
    geo: readRequestGeo(request.headers),
  });

  return licenseResponse(result);
}
