// One-off: wrap every pre-existing Shop that has no Customer (hand-typed by
// an admin before this restructure) in a synthetic Customer, so the admin
// panel's now-Customer-primary /shops page doesn't lose them. Each gets
// name = shop.name, no email/password (no login), matching exactly the
// state they were already in — nothing about how they work changes, only
// where they show up in the list.
//
// Safe to run more than once: only ever touches shops where customerId is
// still null.
//
// Usage (from epos-licensing/):
//   pnpm dlx tsx --env-file=.env scripts/backfill-orphan-shop-customers.ts

import { AuditEventType } from "generated/prisma";
import { db } from "~/server/db";

async function main() {
  const orphans = await db.shop.findMany({ where: { customerId: null } });

  if (orphans.length === 0) {
    console.log("No orphan shops — nothing to do.");
    return;
  }

  for (const shop of orphans) {
    // Only reuse the shop's contact email as the new Customer's email if
    // it's actually free — a collision here would mean two different shops
    // sharing a contact address, which should surface as a manual decision
    // (leave the new Customer's email blank, let an admin sort it out) not
    // get resolved silently by a backfill script.
    const emailFree =
      shop.email !== null && (await db.customer.findUnique({ where: { email: shop.email } })) === null;

    const customer = await db.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { name: shop.name, email: emailFree ? shop.email : null },
      });
      await tx.shop.update({ where: { id: shop.id }, data: { customerId: customer.id } });
      await tx.auditEvent.create({
        data: {
          type: AuditEventType.customer_created,
          actor: "system",
          summary: `${shop.name} wrapped in a Customer record (Shop/Customer restructure backfill)`,
        },
      });
      return customer;
    });

    console.log(`${shop.name}: Shop ${shop.id} -> new Customer ${customer.id}`);
  }

  console.log(`Done — ${orphans.length} shop(s) backfilled.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
