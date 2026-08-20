import { submitQuoteRequest } from "~/server/leads";
import { bearerToken } from "~/server/customer/http";

/**
 * Server-to-server only — same reasoning as /api/customer/register: never
 * called directly from a browser, so no CORS is needed. The bearer token is
 * optional here (unlike /api/customer/me): an anonymous visitor can still
 * request a quote, same as before self-registration existed.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Expected a JSON request body." }, 400);
  }

  const result = await submitQuoteRequest(body, bearerToken(request));

  return json(result, result.ok ? 201 : 422);
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
