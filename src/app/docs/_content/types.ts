/**
 * The shape a guide is written in.
 *
 * Guides exist twice: as a page on this site and as a PDF that ships with the
 * till documentation. Writing them as data rather than as markup is what keeps
 * those two in step. Correct the prose once and both outputs change, which is
 * the whole reason this file exists. Two hand-maintained copies had already
 * drifted once before this was introduced.
 *
 * Inline formatting is deliberately almost nothing: backticks for identifiers
 * (receipt numbers, key names) and `->` for a menu path. Anything richer would
 * mean putting HTML in the content, and HTML in the content is how one renderer
 * quietly starts supporting things the other does not.
 */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | {
      kind: "table";
      /** Screen-reader caption. Both renderers hide it visually. */
      caption: string;
      head: [string, string];
      rows: [string, string][];
    };

export type Section = {
  heading: string;
  blocks: Block[];
};

export type Guide = {
  /** URL segment under /docs, and the PDF's base filename. */
  slug: string;
  title: string;
  /** One sentence under the title. Doubles as the page's meta description. */
  lede: string;
  /** Shown on the /docs index. */
  summary: string;
  sections: Section[];
};
