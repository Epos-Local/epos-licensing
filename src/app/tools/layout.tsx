import Link from "next/link";

/**
 * Shell for the public tools.
 *
 * Deliberately outside the `(admin)` route group, like the guides and for the
 * same reason: auth lives in `(admin)/layout.tsx`, so anything inside that group
 * redirects to /signin. A shop moving its catalogue across has no panel account,
 * and the person doing the move is often the shop itself rather than us.
 *
 * Nothing here reads the database or the session, and nothing on these pages may
 * start doing so. That is what makes leaving them ungated safe: there is no
 * customer data on this side of the line to leak. A tool that needs any belongs
 * in the panel instead.
 *
 * Because these pages are public, no copy on them may name the till system a
 * catalogue is coming from. "Another till system" throughout — the same rule the
 * product itself follows.
 *
 * Single reading column rather than the panel's sidebar topology: there is
 * nothing to navigate between, and the foundation's primitives already assume
 * one scrolling column.
 */
export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="vbg-shell">
      <a className="vbg-skip-link" href="#main">
        Skip to content
      </a>

      <main id="main">{children}</main>

      <footer className="vbg-footer">
        <span className="vbg-meta">
          <Link href="/docs">EPos 365 guides</Link>
        </span>
      </footer>
    </div>
  );
}
