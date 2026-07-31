/**
 * The outcome of the last Server Action, read back off the URL.
 *
 * `role="status"` rather than an alert: these announce a completed action, and
 * an assertive live region would interrupt a screen reader mid-sentence for
 * "Device approved."
 */
export function Notice({ notice, tone }: { notice?: string; tone?: string }) {
  if (!notice) return null;

  return (
    <p
      className="vbg-custom-notice"
      data-tone={tone === "success" ? "success" : "error"}
      role="status"
    >
      {notice}
    </p>
  );
}

/** Narrows the `searchParams` shape Next hands a page. */
export function readNotice(
  searchParams: Record<string, string | string[] | undefined>,
): { notice?: string; tone?: string } {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  return { notice: first(searchParams.notice), tone: first(searchParams.tone) };
}
