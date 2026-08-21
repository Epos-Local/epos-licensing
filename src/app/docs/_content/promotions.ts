import { type Guide } from "./types";

/**
 * Sourced from PromotionMatcher/OrderItemService/Promotion.IsActiveNow:
 * promotions apply the moment a matching product is added, with no staff
 * action and no on-screen label, a product-specific promotion always wins
 * over a category-wide one on the same line rather than stacking, a category
 * promotion also reaches products in its subcategories by walking up the
 * category tree from the product being matched, a FixedPrice promotion
 * silently overrides the unit price with nothing to mark it as a promotion,
 * and any equal start/end time (not just midnight) is read as all day.
 */
export const promotions: Guide = {
  slug: "promotions",
  title: "Promotions",
  lede: "Set a discount to run automatically on a product or category, on a schedule.",
  summary: "Setting up a promotion, when it runs, and how it shows up at the till.",
  sections: [
    {
      heading: "What you can set up",
      blocks: [
        {
          kind: "p",
          text: "Go to Management -> Promotions and add a promotion. Pick one or more products or whole categories, then choose either a percentage off or a fixed price that replaces the normal one. There is no buy-one-get-one or bundle offer yet, only these two.",
        },
      ],
    },
    {
      heading: "Scheduling it",
      blocks: [
        {
          kind: "p",
          text: "Run a promotion all the time, or limit it by a start and end date, a start and end time of day, and specific days of the week. Give it the same start and end time, midnight and midnight or any other matching pair, and it runs all day rather than not at all.",
        },
      ],
    },
    {
      heading: "How it applies",
      blocks: [
        {
          kind: "p",
          text: "Nothing needs pressing. Add a matching product to an order and the price adjusts on its own, as long as the promotion is active right now.",
        },
        {
          kind: "p",
          text: "Type a custom price instead of ringing up a normal product, and it skips promotions entirely. There is no set price for one to apply against.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "Promotions do not stack. Cover a product with both its own promotion and its category's, and only the one on the product itself applies.",
            "A promotion set on a category also reaches products in a subcategory underneath it, not just products filed directly in that category.",
            "On the receipt, a promotion looks exactly like a normal discount. Nothing marks a price change as coming from a promotion rather than a cashier's own discount.",
            "There is no report showing how much a promotion has saved or how often it applied. To track that, check the promotion's dates against your sales figures by hand.",
          ],
        },
      ],
    },
  ],
};
