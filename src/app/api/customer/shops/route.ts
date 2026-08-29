import { customerFromSessionToken } from "~/server/customer/auth";
import { bearerToken } from "~/server/customer/http";
import { createShop } from "~/server/shops";

/**
 * Adds a new shop to the caller's own account, using one of their
 * `shopLimit` slots. See `createShop`'s own comment for why row creation is
 * gated on the same number that gates subdomain activation.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const customer = await customerFromSessionToken(bearerToken(request));
  if (!customer) {
    return json({ ok: false, error: "Not signed in." }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Expected a JSON request body." }, 400);
  }

  const result = await createShop(customer.id, body);

  return json(result, result.ok ? 200 : 422);
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
