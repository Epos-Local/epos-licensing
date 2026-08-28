// One-off: create the standing "Epos365 Demo" customer + shop that the
// corporate homepage's "see it live" link points at. Unlike the shops used
// to verify Milestone 1, this one is not test data — it stays permanently,
// so it must never be swept up by cleanup scripts. subdomain = "demo".
//
// Safe to run more than once: no-ops if a shop with subdomain "demo"
// already exists.
//
// Usage (from epos-licensing/):
//   pnpm dlx tsx --env-file=.env scripts/seed-demo-shop.ts

import { AuditEventType } from "generated/prisma";
import { db } from "~/server/db";

const DEMO_SUBDOMAIN = "demo";
const DEMO_CUSTOMER_EMAIL = "demo-shop@epos365.internal";

async function main() {
  const existing = await db.shop.findUnique({ where: { subdomain: DEMO_SUBDOMAIN } });
  if (existing) {
    console.log(`Demo shop already exists (Shop ${existing.id}) — nothing to do.`);
    return;
  }

  const result = await db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name: "Epos365 Demo",
        email: DEMO_CUSTOMER_EMAIL,
        shopLimit: 1,
      },
    });

    const shop = await tx.shop.create({
      data: {
        name: "Epos365 Demo Shop",
        customerId: customer.id,
        subdomain: DEMO_SUBDOMAIN,
        isPublished: true,
        publishedAt: new Date(),
        styleConfig: {
          accentColor: "#1BA1E2",
          heroText: "This is a live storefront, switched on the same way yours would be.",
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        type: AuditEventType.shop_updated,
        actor: "system",
        summary: `${shop.name} seeded as the standing marketing-site demo storefront`,
      },
    });

    return { customer, shop };
  });

  console.log(`Created demo Customer ${result.customer.id} and Shop ${result.shop.id}`);
  console.log(`Live at subdomain "${DEMO_SUBDOMAIN}" once APP_DOMAIN is set on the corporate site.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
