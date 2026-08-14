import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { sandboxSales } from "~/app/docs/_content/sandbox-sales";

export const metadata: Metadata = {
  title: `${sandboxSales.title} — EPos 365`,
  description: sandboxSales.lede,
};

/**
 * The prose lives in _content/sandbox-sales.ts, not here. The PDF that ships
 * with the till documentation is generated from that same file by
 * `pnpm docs:pdf`, so correcting the guide in one place corrects both.
 */
export default function SandboxSalesPage() {
  return <GuideBody guide={sandboxSales} />;
}
