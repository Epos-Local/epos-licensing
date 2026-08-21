import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { databaseBackup } from "~/app/docs/_content/database-backup";

export const metadata: Metadata = {
  title: `${databaseBackup.title} — EPos 365`,
  description: databaseBackup.lede,
};

/**
 * The prose lives in _content/database-backup.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={databaseBackup} />;
}
