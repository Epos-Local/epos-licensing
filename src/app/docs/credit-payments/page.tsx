import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { creditPayments } from "~/app/docs/_content/credit-payments";

export const metadata: Metadata = {
  title: `${creditPayments.title} — EPos 365`,
  description: creditPayments.lede,
};

/**
 * The prose lives in _content/credit-payments.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={creditPayments} />;
}
