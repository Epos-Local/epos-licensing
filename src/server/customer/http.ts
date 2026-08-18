/** `Authorization: Bearer <token>` — the only credential form these routes accept. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  return match?.[1]?.trim() ?? null;
}
