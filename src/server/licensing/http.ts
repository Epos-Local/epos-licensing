import { z } from "zod";

import type { LicenseServerResponseBody, LicenseServerResult } from "./service";
import { canonicalPayloadJson } from "./signing";

/**
 * The WPF client posts `System.Text.Json`'s default output, which is PascalCase.
 * `Licensing_Design.md` writes the same contract in camelCase. Rather than pick
 * a winner and leave the other silently binding to nothing, read either: the
 * body is normalised to lower case keys before validation, so `LicenseKey`,
 * `licenseKey` and `licensekey` all land in the same place.
 */
function normalizeKeys(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

const nonEmpty = z.string().trim().min(1);

export const activateRequestSchema = z.object({
  licensekey: nonEmpty,
  deviceid: nonEmpty,
  hardwarefingerprint: nonEmpty,
  businessname: z.string().nullish(),
});

export const checkInRequestSchema = z.object({
  licensekey: nonEmpty,
  deviceid: nonEmpty,
  hardwarefingerprint: nonEmpty,
});

export const deviceDeleteRequestSchema = z.object({
  licensekey: nonEmpty,
  deviceid: nonEmpty,
});

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return normalizeKeys(await request.json());
  } catch {
    return {};
  }
}

/**
 * Serializes with the canonical writer rather than `JSON.stringify`.
 *
 * Only the bytes inside `Payload` are covered by the signature, and the client
 * re-serializes the parsed payload before verifying, so a standard encoder
 * would in fact verify correctly. Using the same writer anyway means the blob
 * on the wire, the blob in a generated `.lic` file, and the blob the client
 * writes back out through "Copy license to file" are byte-identical, which
 * turns a support question about a mismatched license into a diff.
 */
export function licenseResponse(result: LicenseServerResult): Response {
  return new Response(serializeResponseBody(result.body), {
    status: result.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Activation state is per-device and changes; nothing here may be cached
      // by an intermediary.
      "cache-control": "no-store",
    },
  });
}

export function serializeResponseBody(body: LicenseServerResponseBody): string {
  const parts: string[] = [];

  parts.push(
    `"License":${
      body.License === null
        ? "null"
        : `{"Payload":${canonicalPayloadJson(body.License.Payload)},"Signature":${JSON.stringify(body.License.Signature)}}`
    }`,
  );
  parts.push(`"ApprovalState":${JSON.stringify(body.ApprovalState)}`);
  parts.push(
    `"Error":${body.Error === null ? "null" : JSON.stringify(body.Error)}`,
  );

  if (body.MaxDevices !== undefined)
    parts.push(`"MaxDevices":${body.MaxDevices}`);
  if (body.ApprovedCount !== undefined) {
    parts.push(`"ApprovedCount":${body.ApprovedCount}`);
  }

  return `{${parts.join(",")}}`;
}

/** A malformed body never reaches the licensing logic. */
export function badRequest(message: string): Response {
  return new Response(
    serializeResponseBody({
      License: null,
      ApprovalState: "invalid_request",
      Error: message,
    }),
    {
      status: 400,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
