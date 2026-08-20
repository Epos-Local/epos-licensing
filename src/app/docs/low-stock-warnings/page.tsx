import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { lowStockWarnings } from "~/app/docs/_content/low-stock-warnings";

export const metadata: Metadata = {
  title: `${lowStockWarnings.title} — EPos 365`,
  description: lowStockWarnings.lede,
};

/**
 * The prose lives in _content/low-stock-warnings.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={lowStockWarnings} />;
}
