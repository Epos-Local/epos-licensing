import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { cashInOut } from "~/app/docs/_content/cash-in-out";

export const metadata: Metadata = {
  title: `${cashInOut.title} — EPos 365`,
  description: cashInOut.lede,
};

/**
 * The prose lives in _content/cash-in-out.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={cashInOut} />;
}
