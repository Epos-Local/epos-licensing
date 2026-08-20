import { type Guide } from "./types";

/**
 * Sourced from StockAlertService: DefaultLowStockThreshold is 0, the threshold
 * test is "at or below", a product opts out through LowStockAlertsEnabled, and
 * inactive products are excluded outright.
 */
export const lowStockWarnings: Guide = {
  slug: "low-stock-warnings",
  title: "Low stock warnings",
  lede: "The till tells you what is running out, so you notice before a customer does.",
  summary: "How the till decides something is running low, and where to set the level.",
  sections: [
    {
      heading: "Where the warnings appear",
      blocks: [
        {
          kind: "p",
          text: "A red badge on the menu button counts everything needing attention. Open the menu and it takes you to Stock alerts, where each product is listed with the reason it is there.",
        },
        {
          kind: "p",
          text: "The same products are highlighted in Management -> Stock, in a column called Needs attention. It is one list shown in two places.",
        },
      ],
    },
    {
      heading: "When a product counts as low",
      blocks: [
        {
          kind: "p",
          text: "Each product is judged against a threshold. If the quantity on hand is at or below it, the product is flagged. At or below, not under: with a threshold of 5 and 5 on the shelf, that is already the moment to reorder rather than a near miss.",
        },
        {
          kind: "p",
          text: "Out of stock always counts, whatever the threshold says.",
        },
      ],
    },
    {
      heading: "Setting the level",
      blocks: [
        {
          kind: "p",
          text: "There are two places to set it, and a product only needs one of them.",
        },
        {
          kind: "ul",
          items: [
            "Settings -> Order & payment -> Items has Low stock threshold. This covers every product that has no figure of its own.",
            "Management -> Products, editing a product, has Low stock threshold (optional). Fill it in and that product ignores the shop-wide figure.",
          ],
        },
        {
          kind: "p",
          text: "The shop-wide figure starts at 0, so out of the box you are only warned once something has actually run out. Raise it and every product without its own figure starts warning at the new level, so expect the badge to jump the first time you change it.",
        },
      ],
    },
    {
      heading: "Turning it off for a product",
      blocks: [
        {
          kind: "p",
          text: "Some products have no shelf to run out of. Services, gift cards and open-price items will sit at zero for ever and warn for ever.",
        },
        {
          kind: "p",
          text: "Edit the product and switch Low stock alerts off. Clearing the threshold box will not do it: an empty box means fall back to the shop-wide figure. The switch is what says never. Expiry warnings are unaffected either way.",
        },
        {
          kind: "p",
          text: "Products marked inactive never appear either, since you cannot sell them anyway.",
        },
      ],
    },
    {
      heading: "Choosing a number",
      startsNewPage: true,
      blocks: [
        {
          kind: "p",
          text: "The useful threshold is however much you sell while a delivery is on its way, plus a little. A line that sells two a day on a weekly order wants a threshold nearer fifteen than three.",
        },
        {
          kind: "p",
          text: "Setting it too high is the more common mistake. Every product over its threshold sits in the badge count, and a badge showing forty is a badge nobody reads.",
        },
      ],
    },
  ],
};
