import type { Device } from "generated/prisma";

/**
 * Where a request came from, as far as we can tell.
 *
 * Every field is optional because none of them are guaranteed: a request that
 * did not arrive through Vercel's edge (local development, a self-hosted
 * deployment, a direct origin hit) carries no geo headers at all.
 */
export interface RequestGeo {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

/**
 * Reads the geo Vercel's edge network already attached to the request.
 *
 * This is why the design doc's "any stack that can sign a blob, check a DB row
 * and do an IP-to-geo lookup" lands on Vercel specifically: `x-vercel-ip-*` is
 * populated at the edge before the function runs, so the one external
 * dependency the whole shop-locking mechanism rests on costs no API call, no
 * key, no rate limit, no per-lookup latency budget, and no third party holding
 * a log of where every one of this vendor's customers operates. A GeoIP SaaS
 * would put a paid network round trip in the path of every activation and
 * check-in, and an outage there would either block activations or force a
 * fail-open that silently disables the locality check the feature exists for.
 *
 * The headers are trusted because Vercel overwrites them on ingress; they
 * cannot be spoofed by the client. On a non-Vercel deployment they are simply
 * absent, which {@link geoMatchesCluster} treats as "cannot confirm" rather
 * than "matches".
 */
export function readRequestGeo(headers: Headers): RequestGeo {
  const first = (name: string): string | null => {
    // x-forwarded-for is a comma-separated chain; the client is the first hop.
    const trimmed = headers.get(name)?.split(",")[0]?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    ip: first("x-forwarded-for") ?? first("x-real-ip"),
    country: first("x-vercel-ip-country"),
    region: first("x-vercel-ip-country-region"),
    // Vercel percent-encodes city names that contain spaces or accents.
    city: safeDecode(first("x-vercel-ip-city")),
  };
}

function safeDecode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** For the `geo` column on an audit row and for display in the admin panel. */
export function formatGeo(geo: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string | null {
  const parts = [geo.city, geo.region, geo.country].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

/** The IPv4 /24 an address sits in, or null for IPv6 and unparseable input. */
function ipv4Slash24(ip: string | null): string | null {
  if (!ip) return null;
  const octets = ip.split(".");
  if (octets.length !== 4) return null;
  if (!octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255))
    return null;
  return octets.slice(0, 3).join(".");
}

export interface ClusterDecision {
  matches: boolean;
  /** One line explaining the call, recorded on the audit row. */
  reason: string;
}

/**
 * Decides whether a new device looks like another till at the same shop.
 *
 * The rule is country plus region, or a shared IPv4 /24. Region rather than
 * city because a shop's two tills routinely geolocate to neighbouring towns
 * when the ISP's egress moves, and a false pending costs a support call on a
 * legitimate sale; the /24 clause catches the same-LAN case directly even when
 * the region reading is missing or has drifted. Country alone would auto-
 * approve a device anywhere in the same country, which is most of the fraud
 * this feature exists to catch.
 *
 * A request with no geo at all never auto-approves. That is the deliberate
 * failure direction: an unconfirmable location goes to the pending queue for a
 * human, rather than silently passing the one check standing between a copied
 * database and a working till.
 */
export function geoMatchesCluster(
  candidate: RequestGeo,
  cluster: Pick<Device, "geoCountry" | "geoRegion" | "lastKnownIp">[],
): ClusterDecision {
  if (cluster.length === 0) {
    return { matches: false, reason: "no approved device to compare against" };
  }

  const candidateSubnet = ipv4Slash24(candidate.ip);

  for (const approved of cluster) {
    if (
      candidateSubnet &&
      candidateSubnet === ipv4Slash24(approved.lastKnownIp)
    ) {
      return {
        matches: true,
        reason: `same IPv4 /24 (${candidateSubnet}.0/24) as an approved device`,
      };
    }

    if (
      candidate.country &&
      candidate.region &&
      candidate.country === approved.geoCountry &&
      candidate.region === approved.geoRegion
    ) {
      return {
        matches: true,
        reason: `same country and region (${candidate.country}/${candidate.region}) as an approved device`,
      };
    }
  }

  if (!candidate.country) {
    return {
      matches: false,
      reason: "no geolocation available for this request",
    };
  }

  return {
    matches: false,
    reason: `location ${formatGeo(candidate) ?? "unknown"} is outside the approved cluster`,
  };
}
