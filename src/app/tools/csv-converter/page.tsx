import { Converter } from "./converter";

/**
 * Turns a product catalogue exported from another till system into the exact CSV
 * EPos 365's own product import reads.
 *
 * Public, with no sign-in: the person moving a catalogue across is usually the
 * shop, and a shop has no panel account. It is safe to leave open because the
 * conversion happens entirely in the visitor's browser — there is no upload, no
 * database read and no session, so there is nothing here to gate.
 *
 * Nothing on this page may name the till system a catalogue is coming from. It
 * is a public URL, and naming another product on it is exactly what the rest of
 * the product avoids.
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
