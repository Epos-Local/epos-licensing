import { compare } from "bcryptjs";

import { db } from "~/server/db";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email) {
    console.log("Usage: tsx scripts/check-customer.ts <email> [password]");
    return;
  }

  const customer = await db.customer.findUnique({
    where: { email },
    include: { shops: true },
  });
  if (!customer) {
    console.log("NO CUSTOMER FOUND with that email");
    return;
  }
  console.log("customer id:", customer.id);
  console.log("has passwordHash:", !!customer.passwordHash);
  console.log("shops count:", customer.shops.length);
  console.log("emailVerifiedAt:", customer.emailVerifiedAt);
  if (customer.passwordHash && password) {
    const matches = await compare(password, customer.passwordHash);
    console.log("password matches:", matches);
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
