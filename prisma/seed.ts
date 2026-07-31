import { hash } from "bcryptjs";

import { PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

/**
 * Bootstraps the first administrator, and only the first.
 *
 * Accounts live in the database and are managed from the panel's
 * Administrators page. This exists purely to solve the chicken and egg: nobody
 * can add an account through the UI until somebody can sign in to reach it.
 *
 * Once an account exists this refuses to touch it, so ADMIN_PASSWORD sitting
 * stale in an environment cannot silently reset a password that has since been
 * changed through the panel. Delete both variables from the environment after
 * the first run; nothing reads them at runtime.
 *
 * Recovering a lost password is a deliberate two-step: remove the account from
 * the database, then run this again.
 */
async function main() {
  const existing = await db.user.count();

  if (existing > 0) {
    console.log(
      `${existing} administrator account(s) already exist. Nothing to do.\n` +
        "Add or change accounts on the panel's Administrators page, not here.",
    );
    return;
  }

  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "No administrator exists yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and run this once to create the first one.",
    );
  }

  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  }

  const user = await db.user.create({
    data: { email, name: "Admin", passwordHash: await hash(password, 12) },
  });

  console.log(`First administrator created: ${user.email}`);
  console.log(
    "Remove ADMIN_EMAIL and ADMIN_PASSWORD from the environment now. Add any\n" +
      "further accounts from the panel's Administrators page.",
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
