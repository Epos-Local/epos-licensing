import { type Metadata } from "next";

import { GuideBody } from "~/app/docs/_components/guide-body";
import { productImport } from "~/app/docs/_content/product-import";

export const metadata: Metadata = {
  title: `${productImport.title} — EPos 365`,
  description: productImport.lede,
};

/**
 * The prose lives in _content/product-import.ts, not here. The PDF that ships with
 * the till documentation is generated from that same file by `pnpm docs:pdf`,
 * so correcting the guide in one place corrects both.
 */
export default function Page() {
  return <GuideBody guide={productImport} />;
}
