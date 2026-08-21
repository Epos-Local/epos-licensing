import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { promotions } from "~/app/docs/_content/promotions";

export const metadata: Metadata = {
  title: `${promotions.title} — EPos 365`,
  description: promotions.lede,
};

/**
 * The prose lives in _content/promotions.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={promotions} />;
}
