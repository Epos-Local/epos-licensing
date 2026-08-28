import { changeCustomerPassword, customerFromSessionToken } from "~/server/customer/auth";
import { bearerToken } from "~/server/customer/http";

/** Self-service password change from the dashboard — requires the current password. */
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
  const { currentPassword, newPassword } = (body ?? {}) as Record<string, unknown>;

  const result = await changeCustomerPassword(
    customer.id,
    typeof currentPassword === "string" ? currentPassword : "",
    newPassword,
  );

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
