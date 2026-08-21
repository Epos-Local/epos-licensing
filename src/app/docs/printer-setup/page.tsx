import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { printerSetup } from "~/app/docs/_content/printer-setup";

export const metadata: Metadata = {
  title: `${printerSetup.title} — EPos 365`,
  description: printerSetup.lede,
};

/**
 * The prose lives in _content/printer-setup.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={printerSetup} />;
}
