/**
 * Proves the catalogue converter turns every dialect of the same export into the
 * same canonical file.
 *
 *   pnpm verify:csv
 *
 * Needs no database and no running server. The fixtures are written here rather
 * than committed as files so the differences between them are visible in one
 * place — the whole point is that four files which look nothing alike must
 * normalise to identical bytes.
 *
 * The baseline fixture is a real export from the till system a customer is
 * migrating from, trimmed to a handful of rows. It already imports into EPos 365
 * untouched; it is here as the control.
 *
 * The locale fixture is the one that does not import, and it does not come from
 * that system's exporter — that writes numbers with InvariantCulture and joins
 * on a comma, always. It comes from the step in between: a shop opens the export
 * in a spreadsheet to tidy it and saves it again, and on a comma-decimal locale
 * the spreadsheet writes semicolons and "35,77". The POS importer then rejects it
 * at the header row, which is the failure this converter exists to absorb.
 */

import { strict as assert } from "node:assert";

import {
  CANONICAL_COLUMNS,
  COLUMNS_READ_BY_POS,
  normalizeProductCsv,
  splitGroupPath,
} from "../src/app/_lib/product-csv";

const HEADER = CANONICAL_COLUMNS.join(",");
const CRLF = "\r\n";

/** The control: comma-delimited, dot decimals, exactly as exported. */
const baseline = [
  HEADER,
  "pran up,,1,2607071908143,,35.7723581676136,-25,33.0,23,1,0,1,0,1,,26,,,,,",
  "Chicken Burger,Burger Menu,2,2607040032480,,0,0,110.0,,1,0,1,0,1,,3,,,,,",
  "coca cola 250 ml,pran/coke,6,,,0,0,0.0,,1,0,1,0,1,,0,,,,,",
].join("\r\n");

/** The failing case: semicolon delimiter, comma decimals. */
const euLocale = [
  HEADER.replace(/,/g, ";"),
  "pran up;;1;2607071908143;;35,7723581676136;-25;33,0;23;1;0;1;0;1;;26;;;;;",
  "Chicken Burger;Burger Menu;2;2607040032480;;0;0;110,0;;1;0;1;0;1;;3;;;;;",
  "coca cola 250 ml;pran/coke;6;;;0;0;0,0;;1;0;1;0;1;;0;;;;;",
].join("\r\n");

/** Tab-delimited, as a spreadsheet "Text (tab delimited)" save produces. */
const tabbed = baseline.replace(/^(.*)$/gm, (line) =>
  line.split(",").join("\t"),
);

/** Aliased headers and a different column order. */
const aliased = [
  "Product Group,Name,Code,Barcode,Cost,Price,Tax Rate,Active,Quantity",
  "pran/coke,coca cola 250 ml,6,,0,0.0,,1,0",
].join("\r\n");

let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok    ${label}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL  ${label}`);
    console.error(`        ${(error as Error).message.split("\n")[0]}`);
  }
}

console.log("\nCatalogue converter\n");

const base = normalizeProductCsv(baseline);
const eu = normalizeProductCsv(euLocale);
const tab = normalizeProductCsv(tabbed);

check("the control file is read", () => {
  assert.equal(base.ok, true, base.errors.join("; "));
  assert.equal(base.report?.delimiter, ",");
  assert.equal(base.report?.commaDecimals, false);
  assert.equal(base.report?.rowCount, 3);
});

check("the comma-decimal file is read", () => {
  assert.equal(eu.ok, true, eu.errors.join("; "));
  assert.equal(eu.report?.delimiter, ";");
  assert.equal(eu.report?.commaDecimals, true);
});

check("both produce byte-identical output", () => {
  assert.equal(eu.csv, base.csv);
});

check("a tab-delimited file produces the same output too", () => {
  assert.equal(tab.ok, true, tab.errors.join("; "));
  assert.equal(tab.report?.delimiter, "\t");
  assert.equal(tab.csv, base.csv);
});

check("output always carries all 21 columns in canonical order", () => {
  assert.equal(base.csv?.split("\r\n")[0], HEADER);
  assert.equal(CANONICAL_COLUMNS.length, 21);
});

check("a decimal comma is converted, a comma in a name is not", () => {
  const result = normalizeProductCsv(
    [
      HEADER.replace(/,/g, ";"),
      '"Cola, 500ml";Drinks;;;;0;0;12,50;;1;0;1;0;1;;0;;;;;',
    ].join("\r\n"),
  );
  assert.equal(result.ok, true, result.errors.join("; "));
  const row = result.csv?.split("\r\n")[1] ?? "";
  assert.ok(
    row.startsWith('"Cola, 500ml",Drinks'),
    `name was rewritten: ${row}`,
  );
  assert.ok(row.includes(",12.50,"), `price was not converted: ${row}`);
});

check("aliased headers in any order resolve", () => {
  const result = normalizeProductCsv(aliased);
  assert.equal(result.ok, true, result.errors.join("; "));
  const row = result.csv?.split("\r\n")[1] ?? "";
  assert.ok(row.startsWith("coca cola 250 ml,pran/coke,6,"), row);
  assert.deepEqual(result.report?.droppedColumns, []);
});

check("a file with no Name or Price is refused, and says what it found", () => {
  const result = normalizeProductCsv("Foo,Bar\n1,2");
  assert.equal(result.ok, false);
  assert.ok(result.errors[0]?.includes("Foo, Bar"), result.errors[0]);
});

check("unknown columns are dropped by name, never silently", () => {
  const result = normalizeProductCsv(
    [`${HEADER},Warehouse`, `x,,,,,0,0,1,,1,0,1,0,1,,0,,,,,,Shelf 4`].join(
      "\r\n",
    ),
  );
  assert.deepEqual(result.report?.droppedColumns, ["Warehouse"]);
});

check("missing canonical columns are emitted blank, and reported", () => {
  const result = normalizeProductCsv(aliased);
  assert.ok(result.report?.filledBlank.includes("Description"));
  assert.equal(result.csv?.split("\r\n")[0], HEADER);
});

check("group paths split the way the POS splits them", () => {
  assert.deepEqual(splitGroupPath("pran/a1/a2"), ["pran", "a1", "a2"]);
  assert.deepEqual(splitGroupPath("Refill\\/Pod Full Box"), [
    "Refill/Pod Full Box",
  ]);
});

check("a description containing a line break survives", () => {
  const result = normalizeProductCsv(
    [HEADER, 'x,,,,,0,0,1,,1,0,1,0,1,"line one\nline two",0,,,,,'].join("\r\n"),
  );
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.report?.rowCount, 1);
  assert.ok(result.csv?.includes('"line one\nline two"'));
});

check("the report names the 15 columns the POS reads", () => {
  assert.equal(COLUMNS_READ_BY_POS.size, 15);
  for (const column of COLUMNS_READ_BY_POS) {
    assert.ok(
      (CANONICAL_COLUMNS as readonly string[]).includes(column),
      `${column} is not a canonical column`,
    );
  }
});

check("the preview counts what the import will decide", () => {
  assert.equal(base.report?.uncategorizedRows, 1);
  assert.deepEqual(base.report?.taxValues, ["23"]);
  assert.deepEqual(base.report?.groupPaths, ["Burger Menu", "pran/coke"]);
  assert.equal(base.report?.rowsPricedZero, 1);
});

check("several barcodes in one cell keep the first and name the rest", () => {
  const result = normalizeProductCsv(
    [HEADER, "x,,,111|222|333,,0,0,1,,1,0,1,0,1,,0,,,,,"].join(CRLF),
  );
  assert.equal(result.ok, true, result.errors.join("; "));
  const row = result.csv?.split(CRLF)[1] ?? "";
  assert.ok(row.startsWith("x,,,111,"), `barcode not reduced: ${row}`);
  assert.deepEqual(result.report?.extraBarcodes, ["222", "333"]);
  assert.ok(result.warnings.some((w) => w.includes("222, 333")));
});

check("several tax rates keep the first, and a fixed tax is flagged", () => {
  const result = normalizeProductCsv(
    [HEADER, "x,,,,,0,0,1,23|5F,1,0,1,0,1,,0,,,,,"].join(CRLF),
  );
  assert.equal(result.ok, true, result.errors.join("; "));
  const row = result.csv?.split(CRLF)[1] ?? "";
  assert.ok(row.includes(",1,23,1,"), `tax not reduced: ${row}`);
  assert.equal(result.report?.multiTaxRows, 1);
  assert.equal(result.report?.fixedTaxRows, 1);
});

check("a bare quote inside an unquoted field does not shear the file", () => {
  // The source exporter only quotes a value when it contains a comma, so a
  // name like 6" Sub arrives with a naked quote in the middle of the field.
  const result = normalizeProductCsv(
    [
      HEADER,
      '6" Sub,Rolls,,,,0,0,4.50,,1,0,1,0,1,,0,,,,,',
      "Tea,Drinks,,,,0,0,1,,1,0,1,0,1,,0,,,,,",
    ].join(CRLF),
  );
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.report?.rowCount, 2);
  const row = result.csv?.split(CRLF)[1] ?? "";
  assert.ok(
    row.startsWith('"6"" Sub",Rolls'),
    `first field was mangled: ${row}`,
  );
});

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
