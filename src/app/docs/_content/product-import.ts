import { type Guide } from "./types";

/**
 * Sourced from ProductCsvService/ManagementViewModel: matching for an update
 * is by Code first, then by Name plus group, so a re-run of the same file is
 * safe rather than creating duplicates; the preview-before-import step exists
 * in code but is currently switched off (ManagementViewModel.cs:4472-4489,
 * "parked until it has been tried on a real catalogue"), so Import writes
 * immediately and only then shows a report, not a preview beforehand. The
 * Aronium .db importer (AroniumImporter) has no menu or button anywhere in
 * Pos.App; it is only ever invoked from the dev harness, so it is described
 * here as a one-off done for the shop, not a self-service screen. A separate
 * "Import groups" button next to Import/Export takes its own, differently
 * shaped file (parent-and-child group names) and can build a nested group
 * tree, which the product file's own Group column cannot do on its own.
 */
export const productImport: Guide = {
  slug: "product-import",
  title: "Importing products",
  lede: "Bring a product list in from a spreadsheet instead of typing every item by hand.",
  summary: "Building a CSV file, importing it, and what happens with items you already have.",
  sections: [
    {
      heading: "Getting a starting file",
      blocks: [
        {
          kind: "p",
          text: "Export first, it is the easiest way to get a file in the right shape. Go to Management -> Products -> Export for a spreadsheet of what is already on the till, in the layout Import expects. Add your new products to it, or clear the rows out and start from a copy.",
        },
      ],
    },
    {
      heading: "What the file needs",
      blocks: [
        {
          kind: "p",
          text: "Name and Price are the only required columns. Everything else, code, barcode, group, cost, tax, stock quantity and a few more, is optional, filled in only where you have it. Columns can be in any order; the till matches them by header name.",
        },
        {
          kind: "p",
          text: "Write a group as a path, such as Drinks/Cola for a subgroup. If a group's own name has a slash in it, write it as \\/ so it does not read as a path separator.",
        },
      ],
    },
    {
      heading: "Importing it",
      blocks: [
        {
          kind: "p",
          text: "Go to Management -> Products -> Import and pick the file. It writes straight away, no preview first. Once it finishes, you get a report: errors, notes such as a tax rate that got created or defaulted, any new groups, and which stock quantities changed.",
        },
      ],
    },
    {
      heading: "Building a nested group tree",
      blocks: [
        {
          kind: "p",
          text: "The product file's own Group column can only create flat, top-level groups. For nested groups, like Drinks with Cola and Juice underneath it, use the separate Import groups button next to Import and Export instead. It reads its own file of group names with their parents, and builds the tree from that.",
        },
      ],
    },
    {
      heading: "What happens to items you already have",
      blocks: [
        {
          kind: "p",
          text: "The till matches a row to an existing product by its code first, then by its name and group together. A match updates that product instead of creating a second one, so running the same file again is safe and will not duplicate anything.",
        },
        {
          kind: "p",
          text: "Leave the tax column blank and the product gets your default tax rate from Settings, falling back to a zero rate if there is not one.",
        },
      ],
    },
    {
      heading: "Moving from Aronium",
      blocks: [
        {
          kind: "p",
          text: "Migrating an existing Aronium database, categories, products, barcodes, tax rates and payment types, is not something you do yourself from a screen. Sales history, layouts and users never move across either way. Ask support to do this for you rather than looking for it in Settings or Management.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "There is no undo for an import. Check the file over before running it; a mistake in it updates real products straight away.",
            "You do not need an empty product list first. Import adds and updates alongside whatever is already there.",
          ],
        },
      ],
    },
  ],
};
