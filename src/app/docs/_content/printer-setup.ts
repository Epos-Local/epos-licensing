import { type Guide } from "./types";

/**
 * Sourced from SettingsViewModel/PrinterRowViewModel: the printer list is a
 * live scan of installed Windows printers (so it has to be set up in Windows
 * first), Paper size and Characters per line are mutually exclusive by design
 * depending on the chosen printer type, and Print logo only does anything on
 * a Windows printer profile, not a Generic/Text only one.
 */
export const printerSetup: Guide = {
  slug: "printer-setup",
  title: "Printer setup and your receipt",
  lede: "Pick a printer for receipts, invoices and the kitchen, and choose what prints on them.",
  summary: "Choosing a printer, testing it, opening the cash drawer, and customizing the receipt.",
  sections: [
    {
      heading: "Before you start",
      blocks: [
        {
          kind: "p",
          text: "The printer has to already be installed in Windows before it will show up here. Plug it in and install its driver first; Settings -> Print picks from whatever Windows already knows about.",
        },
      ],
    },
    {
      heading: "Choosing a printer",
      blocks: [
        {
          kind: "p",
          text: "Settings -> Print -> Printer selection has three rows: Print receipt, Print kitchen ticket and Print invoice. Each gets its own printer from the dropdown, so they do not have to be the same machine. A red mark next to a row means nothing is chosen for it yet.",
        },
        {
          kind: "p",
          text: "Once a printer is picked, a gear icon opens its settings: printer type, paper size, header and footer text, number of copies, and the cash drawer.",
        },
      ],
    },
    {
      heading: "Windows printer or Generic / Text only",
      blocks: [
        {
          kind: "p",
          text: "Windows printer is for anything with a proper Windows driver. It gets your logo and nicer formatting, and lets you choose a paper size of 58mm, 80mm or A4.",
        },
        {
          kind: "p",
          text: "Generic / Text only is for a basic thermal printer with no real driver behind it. It sends plain text instead, sized by characters per line rather than a paper size. A shop only ever needs one of the two settings, and switching printer type is what decides which one you see.",
        },
        {
          kind: "p",
          text: "The logo only appears on a Windows printer. Turning on Print logo for a Generic printer does not print anything, since that kind of printer has no way to print an image at all yet.",
        },
      ],
    },
    {
      heading: "Testing it",
      blocks: [
        {
          kind: "p",
          text: "Print test page, in the same panel, sends a real print with whatever settings you currently have, so you can check them before trusting it to a customer.",
        },
      ],
    },
    {
      heading: "Opening the cash drawer",
      blocks: [
        {
          kind: "p",
          text: "Turn on Open cash drawer on a printer and it pops the drawer every time that printer prints. The exact code that does this differs by printer, so use Find my command: pick your printer's make and model and try each code it offers until the drawer actually opens, then save that one.",
        },
      ],
    },
    {
      heading: "Customizing the receipt",
      blocks: [
        {
          kind: "p",
          text: "Settings -> Print -> Customize receipt covers what appears on it: currency and decimal places, whether tax totals and the tax name print, which customer details show when a customer is attached to the sale, and an address format you can build from tokens with a live preview.",
        },
        {
          kind: "p",
          text: "Your shop's own name, address and logo are set separately, under Management -> My company.",
        },
      ],
    },
  ],
};
