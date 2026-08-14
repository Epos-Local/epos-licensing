import { Fragment } from "react";

import { type Block, type Guide } from "~/app/docs/_content/types";

/**
 * Renders a guide's inline conventions: `backticks` become the foundation's
 * mono role, and `->` becomes an arrow.
 *
 * Split on the backticks rather than replacing into HTML, so the content file
 * never has to be trusted as markup. There is nothing to escape and nothing
 * that can inject.
 */
function inline(text: string) {
  return text.split(/(`[^`]+`)/g).map((piece, index) =>
    piece.startsWith("`") && piece.endsWith("`") && piece.length > 2 ? (
      <span key={index} className="vbg-mono">
        {piece.slice(1, -1)}
      </span>
    ) : (
      <Fragment key={index}>{piece.replaceAll("->", "→")}</Fragment>
    ),
  );
}

function GuideBlock({ block }: { block: Block }) {
  if (block.kind === "p") {
    return <p className="vbg-reading">{inline(block.text)}</p>;
  }

  if (block.kind === "ul") {
    return (
      <ul className="vbg-list">
        {block.items.map((item, index) => (
          <li key={index}>{inline(item)}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="vbg-table-wrap vbg-span-12">
      <table>
        <caption className="vbg-visually-hidden">{block.caption}</caption>
        <thead>
          <tr>
            {block.head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={index}>
              <td>{inline(row[0])}</td>
              <td>{inline(row[1])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuideBody({ guide }: { guide: Guide }) {
  return (
    <>
      <section className="vbg-section">
        <h1 className="vbg-title">{guide.title}</h1>
        <p className="vbg-lede vbg-span-7">{guide.lede}</p>

        {/* `download` rather than a plain link: the page above already is the
            readable version, so anyone reaching for this wants the file, most
            often to print it or send it on. Without the attribute a browser
            opens its own PDF viewer instead, which is a second reading surface
            nobody asked for. */}
        <div className="vbg-custom-actions">
          <a href={`/docs/${guide.slug}.pdf`} className="vbg-button" download>
            Download as PDF
          </a>
        </div>
      </section>

      {guide.sections.map((section) => (
        <section className="vbg-section" key={section.heading}>
          <h2 className="vbg-heading-24">{section.heading}</h2>
          {section.blocks.map((block, index) => (
            <GuideBlock block={block} key={index} />
          ))}
        </section>
      ))}
    </>
  );
}
