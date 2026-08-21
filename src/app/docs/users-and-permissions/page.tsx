import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { usersAndPermissions } from "~/app/docs/_content/users-and-permissions";

export const metadata: Metadata = {
  title: `${usersAndPermissions.title} — EPos 365`,
  description: usersAndPermissions.lede,
};

/**
 * The prose lives in _content/users-and-permissions.ts, not here. The PDF that
 * ships with the till documentation is generated from that same file by
 * `pnpm docs:pdf`, so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={usersAndPermissions} />;
}
