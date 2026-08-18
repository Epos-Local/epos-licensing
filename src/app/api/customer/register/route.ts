import { registerCustomer } from "~/server/customer/auth";

/**
 * Called server-to-server by the corporate website's own backend — never
 * directly from a browser. See SELF_REGISTRATION_DESIGN.md's "How the VPS
 * site should call this" for why: it avoids putting a session-cookie-bearing
 * endpoint behind cross-origin CORS for no benefit.
 *
 * Plain camelCase JSON throughout this file and its siblings under
 * /api/customer — unlike /activate and /checkin, nothing here is deserialized
 * by the WPF client's System.Text.Json, so there is no PascalCase constraint.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Expected a JSON request body." }, 400);
  }

  const result = await registerCustomer(body);

  if (!result.ok) {
    // Wrong shape and "already registered" both read as a client error; the
    // caller distinguishes them by message.
    return json({ ok: false, error: result.error }, 422);
  }

  return json(
    {
      ok: true,
      token: result.token,
      expires: result.expires,
      customer: result.customer,
    },
    201,
  );
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
