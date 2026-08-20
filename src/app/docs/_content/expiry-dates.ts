import { type Guide } from "./types";

/**
 * Sourced from StockAlertService (DefaultExpiryWarningDays 3, expiry outranks
 * low stock, Expired when the date is past), ExpiryAllocation (stock allocated
 * newest-expiry first) and migration 0058 (the register is advisory: nothing
 * decrements an entry on a sale).
 *
 * The purchase route is the primary one and is listed first on purpose. Per
 * migration 0059, the Stock tab flyout was the only way in until a date field
 * was added to the purchase line, precisely so nobody has to retype what they
 * are already entering on the delivery. DocumentEditViewModel.ApplyStockEffectsAsync
 * creates the register entry, on first save only.
 *
 * Wordings quoted in "What the wording on screen means" are the real strings:
 * SalesViewModel builds the badge tooltip, ManagementViewModel.DescribeAlert the
 * Needs attention column, and ProductExpiryViewModel the per-entry status. If
 * any of those are reworded, reword them here too.
 *
 * This guide deliberately does not explain why the product says "expiry date"
 * rather than "best before" (migration 0060). That reasoning belongs to the
 * schema; "best before" appears nowhere a user can see it, so raising it here
 * only introduces a distinction the till never makes.
 */
export const expiryDates: Guide = {
  slug: "expiry-dates",
  title: "Expiry dates",
  lede: "Record what arrived and when it goes off, and the till warns you before it does.",
  summary: "Recording expiry dates on deliveries, and how the warnings work.",
  sections: [
    {
      heading: "Recording dates as a delivery is booked in",
      blocks: [
        {
          kind: "p",
          text: "The usual place is the purchase itself. In Management -> Documents, add a Purchase document for the delivery, and each line has an Expiry date (optional) field alongside the quantity and cost.",
        },
        {
          kind: "p",
          text: "Saving the purchase adds a dated line to the expiry register by itself, noted against the purchase number so you can see where it came from. The date is typed once, while you have the box in your hand, and the purchase doubles as the record of what arrived and how long it was good for.",
        },
        {
          kind: "p",
          text: "The field only appears on purchases. A sale, refund, return or write-off has no delivery date to record, so you will not see it there.",
        },
        {
          kind: "p",
          text: "Dates are picked up the first time a purchase is saved. Going back into a saved purchase later will not add the delivery to the register a second time.",
        },
        {
          kind: "p",
          text: "Record whichever date is printed on the pack, whether that is a use by or a best before. The till treats them the same and just counts down to it.",
        },
      ],
    },
    {
      heading: "Recording a date afterwards",
      blocks: [
        {
          kind: "p",
          text: "When a delivery was booked in without dates, or arrived before anyone was recording them, Management -> Stock has an expiry entry flyout on the product: how much and the date on it.",
        },
        {
          kind: "p",
          text: "Adjusting a product's quantity has the same field, and it dates only the units the change adds. It is ignored when the quantity stays the same or goes down, since nothing new arrived to date.",
        },
        {
          kind: "p",
          text: "Either way, a product can hold several entries at once, which is normal when a new delivery lands before the last one has sold through. The older date carries on warning you after the newer stock arrives.",
        },
        {
          kind: "p",
          text: "Nothing forces you to record dates at all. A product with no entries simply never raises an expiry warning.",
        },
      ],
    },
    {
      heading: "When the warnings start",
      blocks: [
        {
          kind: "p",
          text: "Warnings begin a set number of days before the date, and there are two states. Expiring soon means the date is coming up inside that window. Expired means the date has passed.",
        },
        {
          kind: "ul",
          items: [
            "Settings -> Order & payment -> Items has Expiry warning (days), which starts at 3 and covers every product without its own figure.",
            "Management -> Products, editing a product, has Expiry warning days (optional) for anything that needs longer or shorter notice.",
          ],
        },
        {
          kind: "p",
          text: "Three days suits chilled food. For a frozen or ambient line you would rather shift a fortnight early, set a longer figure on that product rather than raising the shop-wide one, or everything else starts warning far too early.",
        },
      ],
    },
    {
      heading: "Expiry outranks low stock",
      blocks: [
        {
          kind: "p",
          text: "A product can be both low and near its date. You will see the expiry reason, because that is the one with a deadline on it.",
        },
        {
          kind: "p",
          text: "The order is worst first: expired, then expiring soon, then low. The top of the list is always the thing to handle first.",
        },
      ],
    },
    {
      heading: "What the wording on screen means",
      blocks: [
        {
          kind: "p",
          text: "The badge on the menu button counts everything at once, in the form 4 item(s) need attention: 1 expired, 2 expiring soon, 1 low on stock.",
        },
        {
          kind: "p",
          text: "In Management -> Stock, the Needs attention column is more specific. `6 expiring 17 Aug` means six units are covered by an entry dated the seventeenth. `Expired 6 on 10 Aug` means that date has already passed.",
        },
        {
          kind: "p",
          text: "Open a product's expiry entries and each one carries its own status.",
        },
        {
          kind: "ul",
          items: [
            "`in 5d` counts down to the date. It turns amber once inside the warning window.",
            "`Expires today` and `Expired 3d ago` speak for themselves.",
            "`Assumed sold` means stock on hand no longer reaches this entry, so the till has concluded it went out. It stops warning but stays on record, and comes back by itself if a recount puts the stock back up.",
            "`Cleared` means the entry has been closed off, either because somebody ticked it off or because the product hit zero and the till closed its open entries automatically. Unlike Assumed sold, this one is permanent.",
          ],
        },
      ],
    },
    {
      heading: "How overlapping deliveries are handled",
      blocks: [
        {
          kind: "p",
          text: "Selling something does not change what you recorded. Sell six bottles and the stock count drops, but the entry still says six arrived on that date. The till cannot know which pack actually went over the counter.",
        },
        {
          kind: "p",
          text: "Instead it works backwards from the stock on hand, assuming the soonest-dated stock left first and counting whatever remains as the newest. So an older delivery that has sold through stops warning by itself, and the warning you see always points at the soonest date still covered by stock actually on the shelf.",
        },
        {
          kind: "p",
          text: "That is an assumption, not a check. If staff hand over the newest pack because a customer reached to the back of the shelf, the till believes the older one is gone when it is still there. Rotating stock properly is what makes it true.",
        },
        {
          kind: "p",
          text: "The Stock tab shows a Next expiry column, which is the soonest date stock still covers, so you can see what it has concluded.",
        },
      ],
    },
    {
      heading: "Clearing an entry",
      startsNewPage: true,
      blocks: [
        {
          kind: "p",
          text: "When stock has been thrown away or sold through, tick the entry off. It stops warning but stays on record, so you can still look back at what was wasted last month.",
        },
        {
          kind: "p",
          text: "If a product drops to zero the till clears its open entries by itself, since there is nothing left to go off.",
        },
        {
          kind: "p",
          text: "Clearing is one way, however it happened. A cleared entry never warns again, so when stock comes back it needs a new entry with the new date. Assumed sold is the opposite: it is only the till reading the current count, and it undoes itself.",
        },
      ],
    },
  ],
};
