/**
 * Normalises a product catalogue exported from another till system into the exact
 * CSV shape EPos 365's own product import reads.
 *
 * This is deliberately NOT a schema translator. The POS importer already resolves
 * columns by header name, already reads slash-delimited group paths as a nested
 * tree, and already matches tax by percent — a real export from the other system
 * imports as-is. Verified end to end against the live importer, not assumed.
 *
 * What it does NOT survive is a file that has been through a spreadsheet on a
 * comma-decimal locale, which saves semicolon-delimited with "35,77" for numbers.
 * That file fails at the header row with "couldn't find a Name and/or Price
 * column", which is true but useless — the header is there, just split on the
 * wrong character. Note the source exporter itself never writes that shape: it
 * formats every number with InvariantCulture and joins on a comma. The damage
 * happens in between, when someone opens the export to tidy it and saves it back.
 *
 * Three things the source exporter does write that need reducing here, all read
 * off its own code rather than guessed:
 *
 *   - Barcode holds ALL of a product's barcodes, pipe-joined. Our column holds
 *     one, and the POS stores the cell verbatim, so an unconverted "123|456"
 *     becomes a single barcode that never scans.
 *   - Tax holds all of a product's rates, pipe-joined, each optionally suffixed
 *     "F" for a fixed amount. The POS matches on percent, so "23|5F" matches
 *     nothing and the product quietly takes the default rate.
 *   - A value is quoted only when it contains a comma, so a name like 6" Sub
 *     arrives with a bare quote mid-field. See parseDelimited.
 *
 * Everything here is pure: text in, text out, no DOM and no I/O, so the same code
 * runs in the browser and in a script.
 */

/**
 * The 21 columns, in the order the POS writes them. Output always carries all 21,
 * always in this order, whatever the input looked like — that is what makes the
 * conversion deterministic and the result round-trippable.
 */
export const CANONICAL_COLUMNS = [
  "Name",
  "ProductGroup",
  "SKU",
  "Barcode",
  "MeasurementUnit",
  "Cost",
  "Markup",
  "Price",
  "Tax",
  "IsTaxInclusivePrice",
  "IsPriceChangeAllowed",
  "IsUsingDefaultQuantity",
  "IsService",
  "IsEnabled",
  "Description",
  "Quantity",
  "Supplier",
  "ReorderPoint",
  "PreferredQuantity",
  "LowStockWarning",
  "WarningQuantity",
] as const;

export type CanonicalColumn = (typeof CANONICAL_COLUMNS)[number];

/**
 * The 15 columns EPos 365 actually reads on import. The other six are carried
 * through untouched so the file stays valid for the system it came from and for
 * any future build that starts reading them — dropping a column we merely ignore
 * today would be throwing away the shop's data for no gain.
 */
export const COLUMNS_READ_BY_POS: ReadonlySet<string> = new Set([
  "Name",
  "ProductGroup",
  "SKU",
  "Barcode",
  "MeasurementUnit",
  "Cost",
  "Price",
  "Tax",
  "IsTaxInclusivePrice",
  "IsService",
  "IsEnabled",
  "Description",
  "Quantity",
  "LowStockWarning",
  "WarningQuantity",
]);

/**
 * Columns whose values are numbers, and so the only ones where a comma may be a
 * decimal point rather than text. Never applied to Name or Description: "Cola,
 * 500ml" is a product name and rewriting it would corrupt the catalogue.
 */
const NUMERIC_COLUMNS: ReadonlySet<string> = new Set([
  "Cost",
  "Markup",
  "Price",
  "Tax",
  "Quantity",
  "ReorderPoint",
  "PreferredQuantity",
  "WarningQuantity",
]);

/**
 * Header spellings seen in the wild, mapped to the canonical column. Matched
 * after lowercasing and stripping spaces, underscores and hyphens, so
 * "Product Group", "product_group" and "PRODUCTGROUP" all land on ProductGroup.
 * The POS importer accepts Code/Group/TaxRate/Active as aliases too; matching it
 * here means a file that only this tool can read never exists.
 */
const HEADER_ALIASES: Record<string, CanonicalColumn> = {
  code: "SKU",
  itemcode: "SKU",
  group: "ProductGroup",
  productgroup: "ProductGroup",
  category: "ProductGroup",
  taxrate: "Tax",
  vat: "Tax",
  active: "IsEnabled",
  enabled: "IsEnabled",
  isenabled: "IsEnabled",
  barcode: "Barcode",
  ean: "Barcode",
  unit: "MeasurementUnit",
  measurementunit: "MeasurementUnit",
  qty: "Quantity",
  stock: "Quantity",
  sellprice: "Price",
  retailprice: "Price",
  costprice: "Cost",
};

const DELIMITERS = [",", ";", "\t", "|"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

export interface NormalizeReport {
  /** Delimiter found in the source file. */
  delimiter: Delimiter;
  /** Whether numbers in the source used a comma as the decimal point. */
  commaDecimals: boolean;
  rowCount: number;
  /** Source headers that matched a canonical column, as found. */
  matchedColumns: string[];
  /** Canonical columns absent from the source; emitted blank. */
  filledBlank: CanonicalColumn[];
  /** Source columns we do not carry. Dropped, but named so nothing is silent. */
  droppedColumns: string[];
  /** Every group path, with the nesting the POS will build from it. */
  groupPaths: string[];
  /** Rows with no group: the POS files these under "Uncategorized". */
  uncategorizedRows: number;
  /** Distinct Tax values found, as written. */
  taxValues: string[];
  /** Name + group pairs appearing more than once; the POS upserts, so these merge. */
  duplicateNames: string[];
  /** Barcodes on more than one row. The POS skips the later ones with a warning. */
  duplicateBarcodes: string[];
  rowsPricedZero: number;
  rowsDisabled: number;
  /** Extra barcodes past the first, which our one-barcode column cannot carry. */
  extraBarcodes: string[];
  /** Rows whose Tax cell listed more than one rate. Only the first is kept. */
  multiTaxRows: number;
  /** Rows with a fixed-amount tax (an "F" suffix), which we have no equivalent for. */
  fixedTaxRows: number;
}

export interface NormalizeResult {
  ok: boolean;
  /** The converted file, or null when it could not be read at all. */
  csv: string | null;
  errors: string[];
  warnings: string[];
  report: NormalizeReport | null;
}

/** Strips a UTF-8 byte order mark, which Excel writes and JSON.parse-style code trips on. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * RFC 4180 reader. Handles quoted fields, "" as a literal quote inside one, and
 * newlines inside quotes — a Description field with a line break in it is normal
 * in an exported catalogue and splitting on \n would silently shear the file.
 */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      // Only at the START of a field. RFC 4180 says a quote elsewhere is a
      // literal, and that matters here: the source system's exporter only wraps
      // a value in quotes when it contains a comma, so a name like 6" Sub comes
      // through unquoted with a bare quote in the middle. Treating that as an
      // opening quote would swallow the rest of the line and shear the file.
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // Swallowed; the \n that follows ends the row. A lone \r (classic Mac)
      // ends it here instead.
      if (text[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Picks the delimiter by parsing the header with each candidate and taking the
 * one that yields the most fields. Counting raw characters would be fooled by a
 * semicolon file whose product names contain commas; parsing is not.
 */
function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best: Delimiter = ",";
  let bestCount = 0;

  for (const candidate of DELIMITERS) {
    const fields = parseDelimited(firstLine, candidate)[0] ?? [];
    if (fields.length > bestCount) {
      bestCount = fields.length;
      best = candidate;
    }
  }

  return best;
}

/** Normalised form for header matching: lowercase, no spaces/underscores/hyphens. */
function headerKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function resolveHeader(header: string): CanonicalColumn | null {
  const key = headerKey(header);
  const direct = CANONICAL_COLUMNS.find((column) => headerKey(column) === key);
  if (direct) return direct;
  return HEADER_ALIASES[key] ?? null;
}

/** A number written with a comma decimal point, optionally with dot thousands. */
const COMMA_DECIMAL = /^-?\d{1,3}(?:\.\d{3})*,\d+$|^-?\d+,\d+$/;
/** A number written the way we emit it. */
const DOT_DECIMAL = /^-?\d{1,3}(?:,\d{3})*\.\d+$|^-?\d+(?:\.\d+)?$/;

function toDotDecimal(value: string): string {
  // "1.234,56" -> "1234.56"; "35,77" -> "35.77"
  return value.replace(/\./g, "").replace(",", ".");
}

/** RFC 4180 writer: quote only when the value would otherwise be ambiguous. */
function writeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Splits a group path the way the POS does, so the preview shows the tree the
 * import will actually build. A backslash-escaped slash is part of the name.
 */
export function splitGroupPath(path: string): string[] {
  const segments: string[] = [];
  let current = "";
  for (let i = 0; i < path.length; i++) {
    const char = path[i]!;
    if (char === "\\" && path[i + 1] === "/") {
      current += "/";
      i++;
    } else if (char === "/") {
      segments.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  segments.push(current);
  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * The source system writes several barcodes into the one Barcode cell, joined
 * with a pipe. Our Barcode column holds one, and the POS importer stores the
 * whole cell verbatim — so an unconverted "123|456" is saved as a single barcode
 * that no scanner will ever match, silently, with no error anywhere. Keeping the
 * first and naming the rest is the only honest option a one-column format allows.
 */
function splitPiped(value: string): string[] {
  return value
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Tax is written the same way — pipe-joined rates, each optionally suffixed "F"
 * for a fixed-amount tax rather than a percentage. The POS matches a rate by
 * percent, so "23|5F" matches nothing, is reported as an error row, and the
 * product silently takes the default rate instead.
 */
function firstTaxRate(value: string): {
  rate: string;
  multiple: boolean;
  fixed: boolean;
} {
  const parts = splitPiped(value);
  const first = parts[0] ?? "";
  const isFixed = /F$/i.test(first);
  return {
    rate: isFixed ? first.replace(/F$/i, "") : first,
    multiple: parts.length > 1,
    fixed: isFixed || parts.some((part) => /F$/i.test(part)),
  };
}

export function normalizeProductCsv(input: string): NormalizeResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = stripBom(input).trim();

  if (text.length === 0) {
    return {
      ok: false,
      csv: null,
      errors: ["The file is empty."],
      warnings,
      report: null,
    };
  }

  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter).filter(
    (row) => row.some((cell) => cell.trim().length > 0), // drop blank lines
  );

  const headerRow = rows[0];
  if (!headerRow) {
    return {
      ok: false,
      csv: null,
      errors: ["The file has no header row."],
      warnings,
      report: null,
    };
  }

  // Map each source column to a canonical one.
  const sourceToCanonical = headerRow.map(resolveHeader);
  const matchedColumns: string[] = [];
  const droppedColumns: string[] = [];
  headerRow.forEach((header, index) => {
    const canonical = sourceToCanonical[index];
    if (canonical) matchedColumns.push(header.trim());
    else if (header.trim().length > 0) droppedColumns.push(header.trim());
  });

  const indexOf = (column: CanonicalColumn): number =>
    sourceToCanonical.findIndex((candidate) => candidate === column);

  if (indexOf("Name") < 0 || indexOf("Price") < 0) {
    const found =
      headerRow
        .map((h) => h.trim())
        .filter(Boolean)
        .join(", ") || "(none)";
    errors.push(
      `Couldn't find a Name and a Price column. Columns found: ${found}. ` +
        `The file needs at least those two, spelled as the till's own product export spells them.`,
    );
    return { ok: false, csv: null, errors, warnings, report: null };
  }

  const dataRows = rows.slice(1);

  // Decide the decimal convention from the data, not from the delimiter. A
  // semicolon file usually means comma decimals but does not have to, and a
  // comma-delimited file can still carry "35,77" inside quotes.
  let commaDecimals = false;
  outer: for (const row of dataRows) {
    for (const column of NUMERIC_COLUMNS) {
      const index = indexOf(column as CanonicalColumn);
      if (index < 0) continue;
      const value = (row[index] ?? "").trim();
      if (COMMA_DECIMAL.test(value) && !DOT_DECIMAL.test(value)) {
        commaDecimals = true;
        break outer;
      }
    }
  }

  const filledBlank = CANONICAL_COLUMNS.filter((column) => indexOf(column) < 0);

  const groupPaths = new Set<string>();
  const taxValues = new Set<string>();
  const nameGroupSeen = new Map<string, number>();
  const barcodeSeen = new Map<string, number>();
  let uncategorizedRows = 0;
  let rowsPricedZero = 0;
  let rowsDisabled = 0;
  let multiTaxRows = 0;
  let fixedTaxRows = 0;
  const extraBarcodes: string[] = [];

  const out: string[] = [CANONICAL_COLUMNS.join(",")];

  dataRows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2; // 1-based, plus the header

    const cells = CANONICAL_COLUMNS.map((column) => {
      const index = indexOf(column);
      let value = index >= 0 ? (row[index] ?? "").trim() : "";

      if (
        commaDecimals &&
        NUMERIC_COLUMNS.has(column) &&
        COMMA_DECIMAL.test(value)
      ) {
        value = toDotDecimal(value);
      }

      // Both of these arrive pipe-joined from the source system and both are
      // single-valued here. Reduced rather than passed through: an unconverted
      // cell is not a harmless oddity, it is a barcode that never scans and a
      // tax that silently falls back to the default.
      if (column === "Barcode" && value.includes("|")) {
        const codes = splitPiped(value);
        value = codes[0] ?? "";
        extraBarcodes.push(...codes.slice(1));
      }

      if (column === "Tax" && value.length > 0) {
        const tax = firstTaxRate(value);
        if (tax.multiple) multiTaxRows++;
        if (tax.fixed) fixedTaxRows++;
        value = tax.rate;
      }

      return value;
    });

    const valueOf = (column: CanonicalColumn): string =>
      cells[CANONICAL_COLUMNS.indexOf(column)] ?? "";

    const name = valueOf("Name");
    if (name.length === 0) {
      warnings.push(
        `Row ${rowNumber}: no product name — the import will skip it.`,
      );
    }

    const group = valueOf("ProductGroup");
    if (group.length === 0) uncategorizedRows++;
    else groupPaths.add(group);

    const tax = valueOf("Tax");
    if (tax.length > 0) taxValues.add(tax);

    const key = `${name.toLowerCase()} ${group.toLowerCase()}`;
    nameGroupSeen.set(key, (nameGroupSeen.get(key) ?? 0) + 1);

    const barcode = valueOf("Barcode");
    if (barcode.length > 0)
      barcodeSeen.set(barcode, (barcodeSeen.get(barcode) ?? 0) + 1);

    const price = Number(valueOf("Price"));
    if (!Number.isNaN(price) && price === 0) rowsPricedZero++;

    const enabled = valueOf("IsEnabled");
    if (enabled === "0" || enabled.toLowerCase() === "false") rowsDisabled++;

    out.push(cells.map(writeField).join(","));
  });

  // A segment that reads like a real name containing a slash. The POS will split
  // it into two groups, which is usually right and occasionally very wrong.
  for (const path of groupPaths) {
    if (/\s\/\s/.test(path)) {
      warnings.push(
        `Group path "${path}" has a slash with spaces around it. It will become nested groups. ` +
          `If the slash is part of one group's name, write it as \\/ in the file.`,
      );
    }
  }

  if (extraBarcodes.length > 0) {
    warnings.push(
      `${extraBarcodes.length} extra barcode(s) could not be carried: a product can have several ` +
        `in the source file but only one in this format. Add the rest by hand after importing: ` +
        `${extraBarcodes.join(", ")}`,
    );
  }

  if (multiTaxRows > 0) {
    warnings.push(
      `${multiTaxRows} product(s) had more than one tax rate. Only the first is kept — the till ` +
        `applies one rate per product.`,
    );
  }

  if (fixedTaxRows > 0) {
    warnings.push(
      `${fixedTaxRows} product(s) had a fixed-amount tax rather than a percentage. There is no ` +
        `equivalent, so the amount is treated as a percentage — check those products after importing.`,
    );
  }

  const duplicateNames = [...nameGroupSeen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => {
      const [name, group] = key.split(" ");
      return group ? `${name} (in ${group})` : `${name}`;
    });

  const duplicateBarcodes = [...barcodeSeen.entries()]
    .filter(([, count]) => count > 1)
    .map(([barcode]) => barcode);

  const report: NormalizeReport = {
    delimiter,
    commaDecimals,
    rowCount: dataRows.length,
    matchedColumns,
    filledBlank,
    droppedColumns,
    groupPaths: [...groupPaths].sort(),
    uncategorizedRows,
    taxValues: [...taxValues].sort(),
    duplicateNames,
    duplicateBarcodes,
    rowsPricedZero,
    rowsDisabled,
    extraBarcodes,
    multiTaxRows,
    fixedTaxRows,
  };

  return { ok: true, csv: out.join("\r\n") + "\r\n", errors, warnings, report };
}
