"use client";

import { useRef, useState } from "react";

import {
  CANONICAL_COLUMNS,
  COLUMNS_READ_BY_POS,
  normalizeProductCsv,
  splitGroupPath,
  type NormalizeResult,
} from "~/app/_lib/product-csv";

/**
 * A client component because the whole point is that the file never leaves the
 * machine. A catalogue carries the shop's cost prices and margins; uploading it
 * to convert it would mean storing a customer's commercial data on our server to
 * do work the browser can do on its own. There is no API route behind this and
 * there should not be one.
 */

/**
 * Decodes the bytes, honouring the byte order mark. Spreadsheets save "Unicode
 * text" as UTF-16, and a UTF-16 file read as UTF-8 comes out as alternating
 * NUL bytes — every column name unrecognisable, for a file that is perfectly
 * valid. Windows-1252 is the fallback because an older export of a European
 * catalogue is Latin-1 far more often than it is anything else, and decoding it
 * as UTF-8 would mangle every accented product name.
 */
async function decode(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // U+FFFD only appears when a byte was not valid UTF-8, which means the file is
  // some single-byte codepage. Windows-1252 is the safe re-read.
  if (utf8.includes("�")) {
    return new TextDecoder("windows-1252").decode(bytes);
  }
  return utf8;
}

function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const DELIMITER_LABELS: Record<string, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
  "|": "pipe",
};

export function Converter() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<NormalizeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      setFileName(file.name);
      setResult(normalizeProductCsv(await decode(file)));
    } finally {
      setBusy(false);
    }
  }

  const report = result?.report;

  return (
    <>
      <div className="vbg-field vbg-span-7">
        <label className="vbg-label" htmlFor="catalogue">
          Catalogue file
        </label>
        <input
          id="catalogue"
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <p className="vbg-helper">
          Read in your browser. Nothing is uploaded, stored or sent anywhere.
        </p>
      </div>

      {busy ? <p className="vbg-meta">Reading…</p> : null}

      {result && !result.ok ? (
        <div className="vbg-span-7">
          {result.errors.map((error) => (
            <p
              className="vbg-custom-notice"
              data-tone="error"
              role="status"
              key={error}
            >
              {error}
            </p>
          ))}
        </div>
      ) : null}

      {result?.ok && report ? (
        <>
          <h2 className="vbg-heading-24">What this file contains</h2>

          <dl className="vbg-custom-facts vbg-span-12">
            <div className="vbg-custom-fact">
              <dt>Products</dt>
              <dd className="vbg-numeric">{report.rowCount}</dd>
            </div>
            <div className="vbg-custom-fact">
              <dt>Separator found</dt>
              <dd>{DELIMITER_LABELS[report.delimiter] ?? report.delimiter}</dd>
            </div>
            <div className="vbg-custom-fact">
              <dt>Number format</dt>
              <dd>
                {report.commaDecimals
                  ? "35,77 — converted"
                  : "35.77 — already correct"}
              </dd>
            </div>
            <div className="vbg-custom-fact">
              <dt>Groups</dt>
              <dd className="vbg-numeric">{report.groupPaths.length}</dd>
            </div>
            <div className="vbg-custom-fact">
              <dt>Tax rates referenced</dt>
              <dd>
                {report.taxValues.length > 0
                  ? report.taxValues.join(", ")
                  : "none"}
              </dd>
            </div>
            <div className="vbg-custom-fact">
              <dt>Priced at zero</dt>
              <dd className="vbg-numeric">{report.rowsPricedZero}</dd>
            </div>
          </dl>

          <h2 className="vbg-heading-24">Columns</h2>
          <p className="vbg-reading">
            The converted file always carries all {CANONICAL_COLUMNS.length}{" "}
            columns, in this order, whatever the original looked like.{" "}
            {COLUMNS_READ_BY_POS.size} of them are read when you import it; the
            rest are carried through untouched so the file stays valid for the
            system it came from.
          </p>

          <div className="vbg-table-wrap vbg-span-12">
            <table>
              <thead>
                <tr>
                  <th scope="col">Column</th>
                  <th scope="col">Read on import</th>
                  <th scope="col">In your file</th>
                </tr>
              </thead>
              <tbody>
                {CANONICAL_COLUMNS.map((column) => (
                  <tr key={column}>
                    <th scope="row" className="vbg-mono">
                      {column}
                    </th>
                    <td>
                      {COLUMNS_READ_BY_POS.has(column)
                        ? "yes"
                        : "carried through"}
                    </td>
                    <td>
                      {report.filledBlank.includes(column) ? (
                        <span className="vbg-meta">absent — left blank</span>
                      ) : (
                        "present"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.droppedColumns.length > 0 ? (
            <p className="vbg-reading">
              <strong>Dropped:</strong> {report.droppedColumns.join(", ")}.
              These are not columns the till reads, so they are not carried into
              the converted file.
            </p>
          ) : null}

          {report.groupPaths.length > 0 ? (
            <>
              <h2 className="vbg-heading-24">Groups that will be created</h2>
              <p className="vbg-reading">
                A slash makes a nested group.{" "}
                {report.uncategorizedRows > 0 ? (
                  <>
                    {report.uncategorizedRows} product
                    {report.uncategorizedRows === 1 ? "" : "s"} have no group
                    and will go into &ldquo;Uncategorized&rdquo;.
                  </>
                ) : null}
              </p>
              <ul className="vbg-reading">
                {report.groupPaths.map((path) => (
                  <li key={path} className="vbg-mono">
                    {splitGroupPath(path).join(" → ")}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {report.duplicateNames.length > 0 ||
          report.duplicateBarcodes.length > 0 ? (
            <>
              <h2 className="vbg-heading-24">Worth checking first</h2>
              <ul className="vbg-reading">
                {report.duplicateNames.length > 0 ? (
                  <li>
                    Repeated product names in the same group, which the import
                    will merge into one product each:{" "}
                    {report.duplicateNames.join(", ")}
                  </li>
                ) : null}
                {report.duplicateBarcodes.length > 0 ? (
                  <li>
                    Barcodes used on more than one product, which the import
                    will keep on the first and skip on the rest:{" "}
                    {report.duplicateBarcodes.join(", ")}
                  </li>
                ) : null}
              </ul>
            </>
          ) : null}

          {result.warnings.length > 0 ? (
            <ul className="vbg-reading">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <div className="vbg-custom-actions">
            <button
              type="button"
              className="vbg-button"
              onClick={() =>
                download(
                  (fileName ?? "catalogue").replace(/\.[^.]+$/, "") +
                    "-for-epos365.csv",
                  result.csv!,
                )
              }
            >
              Download converted file
            </button>
            <button
              type="button"
              className="vbg-button"
              data-variant="secondary"
              onClick={() => {
                setResult(null);
                setFileName(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Start again
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
