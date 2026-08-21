import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { endOfDay } from "~/app/docs/_content/end-of-day";

export const metadata: Metadata = {
  title: `${endOfDay.title} — EPos 365`,
  description: endOfDay.lede,
};

/**
 * The prose lives in _content/end-of-day.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={endOfDay} />;
}
