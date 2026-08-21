import { cashInOut } from "./cash-in-out";
import { creditPayments } from "./credit-payments";
import { emailReports } from "./email-reports";
import { endOfDay } from "./end-of-day";
import { expiryDates } from "./expiry-dates";
import { lowStockWarnings } from "./low-stock-warnings";
import { printerSetup } from "./printer-setup";
import { printStations } from "./print-stations";
import { sandboxSales } from "./sandbox-sales";
import { slowMovingStock } from "./slow-moving-stock";
import { type Guide } from "./types";
import { usersAndPermissions } from "./users-and-permissions";

/**
 * Every guide, in the order a reader should meet them.
 *
 * One list, three consumers: the /docs index renders it, `pnpm docs:pdf`
 * generates a PDF per entry, and each guide page reads its own record from it.
 * Adding a guide therefore means adding a file and one line here, and it turns
 * up in all three places at once.
 *
 * Hand-ordered rather than read off the filesystem. The three stock guides sit
 * together and run low stock, then expiry, then slow moving: what to reorder,
 * what to shift, what to stop buying. Alphabetical order would split them.
 */
export const guides: Guide[] = [
  sandboxSales,
  lowStockWarnings,
  expiryDates,
  slowMovingStock,
  endOfDay,
  cashInOut,
  creditPayments,
  usersAndPermissions,
  printStations,
  printerSetup,
  emailReports,
];

export const guideBySlug = (slug: string): Guide | undefined =>
  guides.find((guide) => guide.slug === slug);
