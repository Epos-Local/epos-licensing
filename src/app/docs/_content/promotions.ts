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
          text: "Management -> Promotions -> add a promotion. Pick one or more products or whole categories, and for each one choose either a percentage off or a fixed price that replaces the normal one. There is no buy-one-get-one or bundle-style offer yet, only these two.",
        },
      ],
    },
    {
      heading: "Scheduling it",
      blocks: [
        {
          kind: "p",
          text: "A promotion can run all the time, or be limited by a start and end date, a start and end time of day, and which days of the week it is active on. Give it the same start and end time, midnight and midnight or any other matching pair, to mean all day rather than no time at all.",
        },
      ],
    },
    {
      heading: "How it applies",
      blocks: [
        {
          kind: "p",
          text: "Nothing needs pressing. The moment a matching product is added to an order, the price adjusts on its own, as long as the promotion is active right now by its schedule.",
        },
        {
          kind: "p",
          text: "Typing a custom price on the till, rather than ringing up a normal product, skips promotions entirely, since there is no set price for one to apply against.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "Promotions do not stack. If a product is covered by its own promotion and its category's promotion at the same time, only the one on the product itself applies.",
            "A promotion set on a category also reaches products sitting in a subcategory underneath it, not only products filed directly in that category.",
            "On the receipt, a promotion looks exactly like a normal discount. There is nothing printed to say a price change came from a promotion rather than a cashier's own discount.",
            "There is currently no report showing how much a promotion has saved or how often it has applied. Keeping track of that means checking the promotion's dates against your sales figures by hand.",
          ],
        },
      ],
    },
  ],
};
