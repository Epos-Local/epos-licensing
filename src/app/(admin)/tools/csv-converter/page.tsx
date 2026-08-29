import { Converter } from "./converter";

/**
 * Turns a product catalogue exported from another till system into the exact CSV
 * EPos 365's own product import reads.
 *
 * Behind the panel's sign-in rather than on the public docs site: it is a tool a
 * reseller runs while moving a shop across, not something a shop owner needs, and
 * the copy here describes another vendor's file format — which belongs in our own
 * back office, not on a page a customer might land on.
 *
 * Most files need no conversion at all. The importer already resolves columns by
 * header name, already reads slash-delimited group paths as a nested tree, and
 * already matches tax by percent. The case this exists for is a till configured
 * on a comma-decimal locale, which exports semicolon-separated with "35,77" for
 * numbers — that file fails at the header row with a message that sounds like the
 * header is missing when it is simply split on a different character.
 */
export default function CsvConverterPage() {
  return (
    <section className="vbg-section">
      <p className="vbg-meta">Tools</p>
      <h1 className="vbg-title">Catalogue converter</h1>
      <p className="vbg-lede vbg-span-7">
        Converts a product list exported from another till system into a file
        EPos 365 can import. Check what it found, then download the converted
        file and import it from Management &gt; Products.
      </p>

      <Converter />
    </section>
  );
}
