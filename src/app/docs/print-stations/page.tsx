import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { printStations } from "~/app/docs/_content/print-stations";

export const metadata: Metadata = {
  title: `${printStations.title} — EPos 365`,
  description: printStations.lede,
};

/**
 * The prose lives in _content/print-stations.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={printStations} />;
}
