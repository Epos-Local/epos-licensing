import { customerFromSessionToken } from "~/server/customer/auth";
import { bearerToken } from "~/server/customer/http";
import { checkSlugAvailability } from "~/server/shops";

/**
 * Live availability check while a customer types a subdomain slug in the
 * dashboard. Side-effect-free (see checkSlugAvailability's own comment) —
 * safe to call on every keystroke. Server-to-server only, bearer-token
 * authenticated same as /api/customer/me.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const customer = await customerFromSessionToken(bearerToken(request));
  if (!customer) {
    return json({ ok: false, error: "Not signed in." }, 401);
  }

  const slug = new URL(request.url).searchParams.get("slug");
  const result = await checkSlugAvailability(slug);

  return json({ ok: true, ...result }, 200);
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
