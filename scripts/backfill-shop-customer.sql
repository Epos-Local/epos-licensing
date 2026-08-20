-- Backfill for the Shop/Customer relation flip (1:1 Customer.shopId -> 1:N
-- Shop.customerId). See Epos365/SUBDOMAIN_ARCHITECTURE.md, "Tenant data
-- model", for why.
--
-- RUN THIS BEFORE applying the new schema.prisma (db push / migrate).
-- It only adds a column and copies data; it does not touch anything the
-- current, still-live schema depends on, so it is safe to run against the
-- database while the app is still on the OLD schema.
--
-- Usage (from epos-licensing/):
--   npx prisma db execute --file scripts/backfill-shop-customer.sql --schema prisma/schema.prisma
-- (uses DIRECT_URL, the session-mode pooler already required for DDL — see
-- the datasource comment in schema.prisma)
--
-- After this succeeds, run `npm run db:push` (or `db:migrate`) to apply the
-- rest of the schema change. Prisma will see "Shop.customerId" already
-- exists and populated, add the FK/index/unique constraints, add the new
-- nullable storefront columns, add Customer.shopLimit, and drop
-- Customer.shopId — safe by then, since every row's link has already been
-- copied onto Shop.customerId below.

begin;

-- 1. Add the new column ahead of the schema push, so there's somewhere to
--    copy the existing linkage into. Nullable and untyped-by-FK for now —
--    the push step adds the foreign key/unique index once Prisma's own
--    migration generates it from schema.prisma.
alter table "Shop"
  add column if not exists "customerId" text;

-- 2. Copy every existing Customer -> Shop link onto the new column. Every
--    Customer row today has exactly one Shop (the old 1:1), so this is a
--    straight one-to-one copy, not a fan-out.
update "Shop" s
set "customerId" = c."id"
from "Customer" c
where c."shopId" = s."id";

-- 3. Sanity check: every Customer must now have a Shop pointing back at it.
--    A non-zero count here means the copy above missed rows (e.g. a
--    Customer.shopId pointing at a Shop that no longer exists) and must be
--    investigated before proceeding — do not run the schema push if this
--    raises.
do $$
declare
  missing int;
begin
  select count(*) into missing
  from "Customer" c
  left join "Shop" s on s."customerId" = c."id"
  where s."id" is null;

  if missing > 0 then
    raise exception
      '% Customer row(s) have no matching Shop.customerId after backfill — do not proceed to db push/migrate until this is resolved',
      missing;
  end if;
end $$;

commit;
