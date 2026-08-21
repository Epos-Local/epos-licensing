import { type Guide } from "./types";

/**
 * Sourced from SettingsViewModel/PrinterRowViewModel: the printer list is a
 * live scan of installed Windows printers (so it has to be set up in Windows
 * first), Paper size and Characters per line are mutually exclusive by design
 * depending on the chosen printer type, a Windows printer prints the logo
 * unconditionally with no toggle for it, and the Print logo toggle shown on a
 * Generic/Text only printer currently does nothing (no image support in that
 * path yet). Settings -> Print has a third sub-tab, Print stations, covered
 * in its own guide rather than duplicated here. The Advanced tab on a
 * printer's settings panel (cut paper, feed lines, character set, printable
 * margins on roll paper) is a fuller set of options than the guide covers in
 * detail, listed briefly rather than walked through one by one.
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
          text: "Install the printer in Windows before it will show up here. Plug it in and install its driver first. Settings -> Print picks from whatever Windows already knows about.",
        },
      ],
    },
    {
      heading: "Choosing a printer",
      blocks: [
        {
          kind: "p",
          text: "Settings -> Print has three sub-tabs: Printer selection, Print stations and Customize receipt. This guide covers the first and third. Print stations, for routing kitchen and bar tickets to different printers, has its own guide.",
        },
        {
          kind: "p",
          text: "Printer selection has three rows: Print receipt, Print kitchen ticket and Print invoice. Each gets its own printer from the dropdown, so they do not have to be the same machine. A red mark next to a row means nothing is chosen yet.",
        },
        {
          kind: "p",
          text: "Pick a printer, then click its gear icon to open the settings: printer type, paper size, header and footer text, number of copies, and the cash drawer.",
        },
      ],
    },
    {
      heading: "Windows printer or Generic / Text only",
      blocks: [
        {
          kind: "p",
          text: "Windows printer suits anything with a proper Windows driver. It gets nicer formatting and lets you choose a paper size of 58mm, 80mm or A4. Your logo prints automatically, nothing to turn on.",
        },
        {
          kind: "p",
          text: "Generic / Text only suits a basic thermal printer with no real driver. It sends plain text instead, sized by characters per line rather than a paper size. A shop only ever needs one of the two; switching printer type decides which settings you see.",
        },
        {
          kind: "p",
          text: "A Print logo switch appears only for a Generic printer, but right now it does nothing. That kind of printer cannot print an image yet, switch on or off.",
        },
      ],
    },
    {
      heading: "Testing it",
      blocks: [
        {
          kind: "p",
          text: "Click Print test page, in the same panel, to send a real print with your current settings. Check it before trusting it to a customer.",
        },
      ],
    },
    {
      heading: "Opening the cash drawer",
      blocks: [
        {
          kind: "p",
          text: "Turn on Open cash drawer on a printer and it pops the drawer every time that printer prints. The exact code differs by printer, so use Find my command: pick your printer's make and model, try each code it offers until the drawer opens, then save that one.",
        },
      ],
    },
    {
      heading: "More printer settings",
      blocks: [
        {
          kind: "p",
          text: "An Advanced tab in the same panel holds further options: cutting the paper automatically, how many blank lines to feed before it cuts, the character set, and, for a Windows printer on roll paper, printable margins. A receipt printer also gets its own barcode option there. Most shops can leave these at their defaults.",
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
          text: "Your shop's own name, address and logo live separately, under Management -> My company.",
        },
      ],
    },
  ],
};
