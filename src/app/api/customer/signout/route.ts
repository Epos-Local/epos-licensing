import { signOutCustomer } from "~/server/customer/auth";
import { bearerToken } from "~/server/customer/http";

/** Server-to-server only — see the register route's header comment. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  await signOutCustomer(bearerToken(request));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
