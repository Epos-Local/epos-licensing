import { signInCustomer } from "~/server/customer/auth";

/** Server-to-server only — see the register route's header comment. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Expected a JSON request body." }, 400);
  }

  const result = await signInCustomer(body);

  if (!result.ok) {
    return json({ ok: false, error: result.error }, 401);
  }

  return json(
    { ok: true, token: result.token, expires: result.expires, customer: result.customer },
    200,
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
