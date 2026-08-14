import { sandboxSales } from "./sandbox-sales";
import { type Guide } from "./types";

/**
 * Every guide, in the order a reader should meet them.
 *
 * One list, three consumers: the /docs index renders it, `pnpm docs:pdf`
 * generates a PDF per entry, and each guide page reads its own record from it.
 * Adding a guide therefore means adding a file and one line here, and it turns
 * up in all three places at once.
 *
 * Hand-ordered rather than read off the filesystem. There will only ever be a
 * handful of these, and reading order is an editorial decision, not something
 * alphabetical accident should settle.
 */
export const guides: Guide[] = [sandboxSales];

export const guideBySlug = (slug: string): Guide | undefined =>
  guides.find((guide) => guide.slug === slug);
