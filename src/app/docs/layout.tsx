import Link from "next/link";

/**
 * Shell for the public guides.
 *
 * Deliberately outside the `(admin)` route group, and that is the whole point:
 * auth lives in `(admin)/layout.tsx`, so anything in that group redirects to
 * /signin. These pages are meant to be opened straight from a till by whoever
 * is standing at it, and a cashier has no panel account and never will. Putting
 * them under `(admin)` would make them unreachable by the only audience they
 * have.
 *
 * Nothing here reads the database or the session, so there is nothing to leak.
 * Keep it that way: a guide that needs customer data belongs in the panel.
 *
 * Single reading column rather than the panel's sidebar topology. There is no
 * navigating between guides mid-read, and the foundation's primitives already
 * assume one scrolling column.
 */
export default function DocsLayout({
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
