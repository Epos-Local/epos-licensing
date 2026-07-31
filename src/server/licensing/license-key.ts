import { randomInt } from "node:crypto";

/**
 * `I`, `O`, `0` and `1` are omitted. Support reads these keys down the phone
 * and customers type them into a till, so the pairs that get misheard or
 * mistyped are worth the small loss of entropy: 32^16 is still ample.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const GROUPS = 4;
const GROUP_LENGTH = 4;

/** Produces a key in the `ABCD-1234-EFGH-5678` shape the client's key field expects. */
export function generateLicenseKey(): string {
  const groups: string[] = [];

  for (let group = 0; group < GROUPS; group++) {
    let chars = "";
    for (let i = 0; i < GROUP_LENGTH; i++) {
      chars += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(chars);
  }

  return groups.join("-");
}

/**
 * Normalizes a device id read aloud or pasted from a customer's License screen.
 *
 * The client stores its device id as `Guid.NewGuid().ToString("N")`, so the
 * real value is 32 lower-case hex characters with no separators. Support gets
 * given the hyphenated GUID form often enough that stripping separators is
 * worth doing, and case varies with whoever retyped it.
 *
 * Returns null for anything that is not a device id, which matters more than it
 * looks: a file generated against a typo is bound to a device that does not
 * exist, and the client rejects it outright with "issued for a different
 * device" rather than explaining that the id was wrong.
 */
export function normalizeDeviceId(input: string): string | null {
  const stripped = input.trim().toLowerCase().replace(/[\s-]/g, "");
  return /^[0-9a-f]{32}$/.test(stripped) ? stripped : null;
}

/**
 * Accepts what a customer actually types: lower case, missing hyphens, stray
 * whitespace. Returns null when the input cannot be read as a key at all.
 */
export function normalizeLicenseKey(input: string): string | null {
  const stripped = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (stripped.length !== GROUPS * GROUP_LENGTH) return null;

  return (stripped.match(/.{4}/g) ?? []).join("-");
}
