/**
 * Renders each guide in src/app/docs/_content to a print-styled PDF in
 * public/docs, so the file the till documentation ships is generated from the
 * same source as the page on this site.
 *
 * Print CSS rather than the site's stylesheet on purpose. The brand foundation
 * is built for a screen: its colour, spacing and type scale do not survive being
 * squeezed onto A4, and the page has navigation and a download link that mean
 * nothing on paper. So the two renderers share the words and diverge on
 * presentation, which is the only part that should differ.
 *
 * Uses whichever Chromium-family browser is installed rather than bundling one.
 * This runs on a maintainer's machine, and the output is committed, so there is
 * no reason to put a headless browser download into CI for a file that changes
 * a few times a year.
 *
 *   pnpm docs:pdf
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { guides } from "../src/app/docs/_content";
import { type Block, type Guide } from "../src/app/docs/_content/types";

const run = promisify(execFile);

const BROWSER_CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

async function findBrowser(): Promise<string> {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  throw new Error(
    "No Chromium-family browser found. Set one of the paths in BROWSER_CANDIDATES, " +
      "or install Edge or Chrome.",
  );
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The same inline conventions the web renderer applies, for paper. */
function inline(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((piece) =>
      piece.startsWith("`") && piece.endsWith("`") && piece.length > 2
        ? `<code>${escapeHtml(piece.slice(1, -1))}</code>`
        : escapeHtml(piece).replaceAll("-&gt;", "&rarr;"),
    )
    .join("");
}

function renderBlock(block: Block): string {
  if (block.kind === "p") return `<p>${inline(block.text)}</p>`;

  if (block.kind === "ul") {
    return `<ul>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;
  }

  const head = block.head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const rows = block.rows
    .map((row) => `<tr><td>${inline(row[0])}</td><td>${inline(row[1])}</td></tr>`)
    .join("");
  return `<table><caption>${escapeHtml(block.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderGuide(guide: Guide): string {
  // A heading and the block under it go inside one keep-together box. CSS
  // `break-after: avoid` on the heading alone is advisory and Chromium ignores
  // it often enough to matter: "Where practice sales show up" ended up alone at
  // the foot of page two with its table overleaf. Wrapping the pair in an
  // element that cannot be split is the part Chromium actually honours.
  const body = guide.sections
    .map((section) => {
      const [first, ...rest] = section.blocks;
      const opener = first ? renderBlock(first) : "";
      const cls = section.startsNewPage ? "keep page-break" : "keep";
      return (
        `<div class="${cls}"><h2>${escapeHtml(section.heading)}</h2>${opener}</div>` +
        rest.map(renderBlock).join("")
      );
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(guide.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1b1b1b; font-size: 10.5pt; line-height: 1.5; }
  h1 { font-size: 21pt; margin: 0 0 2mm; }
  .sub { color: #5a5a5a; font-size: 10pt; margin: 0 0 8mm; }
  h2 { font-size: 12.5pt; margin: 0 0 2mm; padding-bottom: 1.5mm; border-bottom: 1px solid #d5d5d5;
       break-after: avoid; page-break-after: avoid; }
  /* The heading and its first block travel together; see renderGuide. The gap
     between sections lives on this box rather than on the h2, so a section that
     starts a page does not also inherit 7mm of dead space above it. */
  .keep { margin-top: 7mm; break-inside: avoid; page-break-inside: avoid; }
  /* Set per section by startsNewPage. The top margin goes: a section opening a
     page should start at the top of it, not 7mm down. */
  .page-break { break-before: page; page-break-before: always; margin-top: 0; }
  p { margin: 0 0 2.5mm; orphans: 3; widows: 3; }
  ul { margin: 0 0 3mm; padding-left: 5mm; }
  li { margin-bottom: 1.2mm; break-inside: avoid; }
  code { font-family: Consolas, monospace; font-size: 9.5pt; }
  /* These tables are five rows each, so keeping one whole costs less than the
     confusion of a two-row orphan. thead repeats if one ever does grow enough
     to split. */
  table { border-collapse: collapse; width: 100%; margin: 0 0 3mm; break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #d5d5d5; padding: 2mm 2.5mm; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; font-weight: 600; }
  /* The caption is a screen-reader label on the web. On paper the heading above
     the table already says what it is, so it would only repeat itself. */
  caption { display: none; }
  .foot { margin-top: 8mm; padding-top: 2mm; border-top: 1px solid #d5d5d5; color: #6a6a6a; font-size: 8.5pt; }
</style>
</head>
<body>
<h1>${escapeHtml(guide.title)}</h1>
<p class="sub">${escapeHtml(guide.lede)}</p>
${body}
<div class="foot">EPos 365, ${escapeHtml(guide.title)}.</div>
</body>
</html>`;
}

/**
 * Hash of the rendered HTML for each slug, so an unchanged guide is not
 * regenerated.
 *
 * Chromium stamps a creation date and a document id into every PDF it prints,
 * so printing the same guide twice produces different bytes. These files are
 * committed, which means each pointless regeneration would add another ~76 KB
 * blob to the repository forever, and the diff would say the guide changed when
 * it did not. Comparing the SOURCE instead of the output sidesteps that: the
 * PDF is only rewritten when the words actually change.
 */
const MANIFEST = path.join(process.cwd(), "scripts", "docs-manifest.json");

async function readManifest(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const outDir = path.join(process.cwd(), "public", "docs");
  await mkdir(outDir, { recursive: true });

  const manifest = await readManifest();
  const next: Record<string, string> = {};
  let browser: string | null = null;

  for (const guide of guides) {
    const html = renderGuide(guide);
    const hash = createHash("sha256").update(html).digest("hex");
    const pdfPath = path.join(outDir, `${guide.slug}.pdf`);
    next[guide.slug] = hash;

    const exists = await access(pdfPath).then(
      () => true,
      () => false,
    );
    if (!force && exists && manifest[guide.slug] === hash) {
      console.log(`${guide.slug}.pdf unchanged`);
      continue;
    }

    // Only pay for finding a browser once something actually needs printing.
    browser ??= await findBrowser();

    const htmlPath = path.join(tmpdir(), `epos-guide-${guide.slug}.html`);
    try {
      await writeFile(htmlPath, html, "utf8");
      await rm(pdfPath, { force: true });
      await run(browser, [
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        `--print-to-pdf=${pdfPath}`,
        `file:///${htmlPath.replaceAll("\\", "/")}`,
      ]);
      await access(pdfPath);
      console.log(`${guide.slug}.pdf written`);
    } finally {
      // finally, not after the call: a print that throws would otherwise leave
      // its scratch file behind in the temp directory on every failed run.
      await rm(htmlPath, { force: true });
    }
  }

  // A renamed or deleted guide leaves its old PDF sitting in public/docs, still
  // served and still committed, describing a guide that no longer exists.
  const slugs = new Set(guides.map((guide) => guide.slug));
  for (const file of await readdir(outDir)) {
    if (!file.endsWith(".pdf")) continue;
    if (slugs.has(file.slice(0, -4))) continue;
    await rm(path.join(outDir, file), { force: true });
    console.log(`${file} removed, no guide claims it`);
  }

  await writeFile(MANIFEST, `${JSON.stringify(next, null, 2)}
`, "utf8");
}

await main();
