import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { Notice, readNotice } from "~/app/_components/notice";
import { formValue } from "~/server/actions/shared";
import { auth, signIn } from "~/server/auth";

export const dynamic = "force-dynamic";

/**
 * The panel's only unauthenticated page.
 *
 * One operator, one credential, per the design doc's "single admin login is
 * enough for v1". The account is created by `pnpm db:seed`; there is
 * deliberately no self-service registration, because anyone who could register
 * could mint licenses.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.user?.email) redirect("/");

  const { notice, tone } = readNotice(await searchParams);

  async function authenticate(formData: FormData) {
    "use server";

    try {
      await signIn("credentials", {
        email: formValue(formData, "email"),
        password: formValue(formData, "password"),
        redirectTo: "/",
      });
    } catch (error) {
      // A successful sign-in throws NEXT_REDIRECT, which has to pass through.
      // Only a genuine auth failure is turned into a message, and it stays
      // vague: naming which half was wrong tells an attacker which emails exist.
      if (error instanceof AuthError) {
        redirect(
          "/signin?notice=Those+details+were+not+recognised.&tone=error",
        );
      }
      throw error;
    }
  }

  return (
    <div className="vbg-shell">
      <header className="vbg-header">
        <div className="vbg-masthead">
          <span className="vbg-identity">EPos 365 licensing</span>
        </div>
      </header>

      <main id="main">
        <section className="vbg-section">
          <h1 className="vbg-title">Sign in</h1>
          <p className="vbg-lede vbg-span-6">
            Licence administration for EPos 365.
          </p>

          {/*
            The three suppressHydrationWarning attributes below are for password
            managers, which stamp their own attributes onto a login form and its
            fields before React hydrates. That is a genuine mismatch between the
            server HTML and the live DOM, and React reports it, but nothing here
            is at fault and nothing can be done about it from this side.

            The suppression is deliberately narrow. It is shallow by design, so
            it has to be repeated on each field rather than set once on the
            form, and it is applied only to this markup, which is static and has
            no dynamic content that could ever mismatch for a real reason. Do
            not spread it to elements that render data.
          */}
          <form
            action={authenticate}
            className="vbg-custom-signin"
            suppressHydrationWarning
          >
            <div className="vbg-field">
              <label className="vbg-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                suppressHydrationWarning
              />
            </div>

            <div
              className="vbg-field"
              style={{ marginTop: "var(--vbg-space-4)" }}
            >
              <label className="vbg-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                suppressHydrationWarning
              />
            </div>

            <div
              className="vbg-custom-actions"
              style={{ marginTop: "var(--vbg-space-6)" }}
            >
              <button type="submit" className="vbg-button">
                Sign in
              </button>
            </div>

            <Notice notice={notice} tone={tone} />
          </form>
        </section>
      </main>

      <footer className="vbg-footer">
        <span className="vbg-meta">EPos 365</span>
      </footer>
    </div>
  );
}
