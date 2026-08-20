import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { expiryDates } from "~/app/docs/_content/expiry-dates";

export const metadata: Metadata = {
  title: `${expiryDates.title} — EPos 365`,
  description: expiryDates.lede,
};

/**
 * The prose lives in _content/expiry-dates.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={expiryDates} />;
}
