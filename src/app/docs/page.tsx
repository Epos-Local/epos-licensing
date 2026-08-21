import Link from "next/link";
import { type Metadata } from "next";

import { guides } from "~/app/docs/_content";

export const metadata: Metadata = {
  title: "Guides — EPos 365",
  description:
    "How-to guides for the EPos 365 till, written for the people using it.",
};

/**
 * Index of the public guides, driven by the registry in _content/index.ts so a
 * new guide appears here the moment it is added rather than when somebody
 * remembers to link it.
 */
export default function DocsIndexPage() {
  return (
    <section className="vbg-section">
      <h1 className="vbg-title">Guides</h1>

      <p className="vbg-lede vbg-span-7">
        Step-by-step guides for everyday till use, not the install process.
        No sign-in required — open them directly on the till or send the link
        to a shop.
      </p>

      <div className="vbg-table-wrap vbg-span-12">
        <table>
          <caption className="vbg-visually-hidden">
            Available guides, with a PDF of each
          </caption>
          <thead>
            <tr>
              <th scope="col">Guide</th>
              <th scope="col">What it covers</th>
              <th scope="col">PDF</th>
            </tr>
          </thead>
          <tbody>
            {guides.map((guide) => (
              <tr key={guide.slug}>
                <td>
                  <Link href={`/docs/${guide.slug}`}>{guide.title}</Link>
                </td>
                <td>{guide.summary}</td>
                <td>
                  <a href={`/docs/${guide.slug}.pdf`} download>
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
