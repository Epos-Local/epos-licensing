import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { emailReports } from "~/app/docs/_content/email-reports";

export const metadata: Metadata = {
  title: `${emailReports.title} — EPos 365`,
  description: emailReports.lede,
};

/**
 * The prose lives in _content/email-reports.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={emailReports} />;
}
