import { type Guide } from "./types";

/**
 * Sourced from KitchenTicketPrintOrchestrator/PrintStationAssignmentEditor:
 * creating a station's name and assigning it a printer are two separate
 * screens, a station wins on its own product assignment over its category's,
 * and there is deliberately no fallback printer for a misconfigured station
 * (matching Aronium's own behaviour), with only a warning badge in Settings
 * (a red circle with "!", tooltip "No printer assigned - items routed to
 * this station won't print until one is chosen"). Each station's printer has
 * its own full settings panel (gear icon), the same kind covered in the
 * Printer setup guide, including its own Print test page button.
 */
export const printStations: Guide = {
  slug: "print-stations",
  title: "Print stations",
  lede: "Send kitchen and bar tickets to the right printer automatically, by what was ordered.",
  summary: "Setting up a print station, routing products to it, and the warning that means it will not print.",
  sections: [
    {
      heading: "What a print station is",
      blocks: [
        {
          kind: "p",
          text: "A print station is a named destination, like Kitchen or Bar, with one printer attached. Route a product to a station and every order for it prints a ticket for just that station, to that printer.",
        },
        {
          kind: "p",
          text: "Anything not routed to a station falls back to the single Kitchen ticket printer, set in Settings -> Print -> Printer selection.",
        },
      ],
    },
    {
      heading: "Setting one up",
      blocks: [
        {
          kind: "p",
          text: "It takes two steps, on two different screens.",
        },
        {
          kind: "ul",
          items: [
            "Management -> Print stations: create the station and give it a name.",
            "Settings -> Print -> Print stations: pick that station from the list and choose which printer it prints to.",
          ],
        },
        {
          kind: "p",
          text: "A station created but never given a printer looks finished on the Management screen. It is not. Nothing routed to it will print until you choose a printer for it in Settings.",
        },
        {
          kind: "p",
          text: "Once a station has a printer, click the gear icon next to it. This opens the same settings panel a receipt or kitchen printer gets: paper size, header and footer text, and a Print test page button to check it before relying on it. See the Printer setup guide for what each setting does.",
        },
      ],
    },
    {
      heading: "Routing products to a station",
      blocks: [
        {
          kind: "p",
          text: "Open a product or a category and look for its Print stations tab. Pick a station there, and every order for that item goes to it.",
        },
        {
          kind: "p",
          text: "Routing a category routes everything in it. Give a product its own station and that choice wins over the category's.",
        },
        {
          kind: "p",
          text: "Send an item to more than one station at once, if it needs a ticket in two places.",
        },
      ],
    },
    {
      heading: "The warning to watch for",
      blocks: [
        {
          kind: "p",
          text: "In Settings -> Print -> Print stations, a station missing its printer shows a small red warning mark, saying it won't print until you choose one. That is the only warning you get. A station in this state does not fall back to any other printer; it simply drops whatever is routed to it.",
        },
        {
          kind: "p",
          text: "Check for that warning after any change to your printers or stations, before it costs you a lost order.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "Settings -> Print -> Customize receipt has a Kitchen item text size setting (Normal, Large, Extra large). It only affects kitchen tickets, not the customer's receipt.",
            "There is no reprint button for a kitchen ticket once it has gone to the printer.",
          ],
        },
      ],
    },
  ],
};
