// Targeted backup of the two tables the Shop/Customer relation-flip
// migration touches (see backfill-shop-customer.sql and
// Epos365/SUBDOMAIN_ARCHITECTURE.md). Not a full-database backup — Supabase
// already takes automated daily backups for that; this is just enough to
// reverse THIS specific change (Customer.shopId -> Shop.customerId) if the
// backfill goes wrong.
//
// Usage (from epos-licensing/):
//   pnpm dlx tsx --env-file=.env scripts/backup-shop-customer.ts

import { writeFileSync, mkdirSync } from "node:fs";

import { db } from "~/server/db";

async function main() {
  const [customers, shops] = await Promise.all([
    db.customer.findMany(),
    db.shop.findMany(),
  ]);

  mkdirSync("backups", { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outfile = `backups/shop-customer-${timestamp}.json`;

  writeFileSync(outfile, JSON.stringify({ customers, shops }, null, 2));

  console.log(`Backed up ${customers.length} customers, ${shops.length} shops -> ${outfile}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
