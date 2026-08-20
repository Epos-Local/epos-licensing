import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { slowMovingStock } from "~/app/docs/_content/slow-moving-stock";

export const metadata: Metadata = {
  title: `${slowMovingStock.title} — EPos 365`,
  description: slowMovingStock.lede,
};

/**
 * The prose lives in _content/slow-moving-stock.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={slowMovingStock} />;
}
