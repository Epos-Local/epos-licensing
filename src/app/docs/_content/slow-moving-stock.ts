import { type Guide } from "./types";

/**
 * Sourced from ReportDataService.GetSlowMovingAsync (active products with
 * Quantity > 0; the last-sold lookup spans all history and is deliberately not
 * bounded by the report period; sold-in-period is informational only) and
 * StockAlertService.DefaultSlowMovingDays, which is 90.
 */
export const slowMovingStock: Guide = {
  slug: "slow-moving-stock",
  title: "Slow moving stock",
  lede: "Which products are sitting on the shelf not selling, and how much money is stuck in them.",
  summary: "Finding stock that is not selling, and what the report is counting.",
  sections: [
    {
      heading: "What it is for",
      blocks: [
        {
          kind: "p",
          text: "Low stock warnings tell you what to reorder. This is the opposite question: what did you buy that nobody is buying back. Every one of those lines is money sitting on a shelf instead of in the till.",
        },
      ],
    },
    {
      heading: "Where to find it",
      blocks: [
        {
          kind: "ul",
          items: [
            "Management -> Reporting has the full Slow moving report, with a period picker and filters for a single product or category.",
            "The Dashboard carries a shorter Slow moving card, showing the worst offenders at a glance.",
          ],
        },
      ],
    },
    {
      heading: "What counts as slow",
      blocks: [
        {
          kind: "p",
          text: "A product appears when it has stock on hand and has not sold for longer than the shop's slow moving period. That period is in Settings -> Order & payment -> Items, under Slow moving after (days), and starts at 90.",
        },
        {
          kind: "p",
          text: "Retail generally uses somewhere between 90 and 180 days. The right number depends on what you sell: a delicatessen counting in weeks and a hardware shop counting in seasons should not use the same figure.",
        },
      ],
    },
    {
      heading: "Reading the report",
      blocks: [
        {
          kind: "p",
          text: "Rows are sorted slowest first, so the top of the list is the stock that has sat longest. The bar beside each row is the money tied up in it, which is quantity multiplied by what it cost you.",
        },
        {
          kind: "p",
          text: "A long bar near the top is the row worth acting on: old stock and a lot of money in it. A long bar low down is simply an expensive product that still sells.",
        },
        {
          kind: "p",
          text: "Products that have never sold at all appear too. Usually that is something ordered once that never found its customer.",
        },
      ],
    },
    {
      heading: "What the period does, and does not, do",
      blocks: [
        {
          kind: "p",
          text: "This is the part that catches people out. The period you pick does not decide which products are listed. Whether a product is slow is judged against its last sale across the whole of your history, not just the window on screen.",
        },
        {
          kind: "p",
          text: "The period only fills in the sold in period column, which is there for context. So a product last sold two years ago still shows up with the period set to this month. That is the report working, not a mistake.",
        },
      ],
    },
    {
      heading: "What is left out",
      blocks: [
        {
          kind: "ul",
          items: [
            "Products with nothing on hand. A line you have sold out of is not tying up any money.",
            "Inactive products, which you cannot sell anyway.",
            "Practice sales rung in sandbox mode, which never count as sales here.",
          ],
        },
      ],
    },
    {
      heading: "Acting on it",
      blocks: [
        {
          kind: "p",
          text: "The usual moves are to discount it, move it somewhere customers actually look, bundle it with something that does sell, or stop reordering it. The report will not tell you which, but it does tell you where the money is, and that is the part which is hard to see from behind the counter.",
        },
        {
          kind: "p",
          text: "Worth a look monthly. Checked more often than that, nothing has changed since last time.",
        },
      ],
    },
  ],
};
