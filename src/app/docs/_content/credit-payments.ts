import { type Guide } from "./types";

/**
 * Sourced from CreditPaymentsViewModel/CreditService: "On account" is a
 * payment type like any other (MarkAsPaid = 0), not a separate flow, and
 * CreditLimit on a customer record is stored but never enforced anywhere.
 * A credit payment collected here also cannot be told apart from an ordinary
 * tender on the End of day report (EndOfDayReportBinder's credit-payments
 * table is always empty), so that limitation is worth stating plainly.
 * Manual mode's unpaid-sales list has to be loaded explicitly (a reload
 * button) after switching to it; it does not populate on its own.
 */
export const creditPayments: Guide = {
  slug: "credit-payments",
  title: "Credit payments",
  lede: "Take a payment against a customer's balance for sales that were put on account.",
  summary: "How a balance builds up, and how to collect a payment against it.",
  sections: [
    {
      heading: "How a balance happens",
      blocks: [
        {
          kind: "p",
          text: "There is no separate credit flow at checkout. A sale is tendered with On account like any other payment type, and because that type is not marked as paid, the sale sits unpaid against the customer until it is settled.",
        },
      ],
    },
    {
      heading: "Opening it",
      blocks: [
        {
          kind: "p",
          text: "Open the hamburger menu and choose Credit payments. You will need a PIN with access to it if you are not already signed in as one.",
        },
      ],
    },
    {
      heading: "Taking a payment",
      blocks: [
        {
          kind: "p",
          text: "Search for the customer and their balance appears, added up from everything of theirs still unpaid. Pick a real payment type for what they are actually handing over, Cash by default, and type the amount.",
        },
        {
          kind: "p",
          text: "Automatic applies the payment to their oldest unpaid sales first. Manual lets you tick specific sales to pay off instead, if a customer wants to settle one invoice rather than the balance as a whole, but switching to Manual does not load their sales on its own: press the reload button first, or the list sits empty with nothing to tick.",
        },
        {
          kind: "p",
          text: "Either way, a sale is only marked paid once its full amount is covered.",
        },
        {
          kind: "p",
          text: "You cannot take more than the customer actually owes; the screen will not let you.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "A credit limit can be set on a customer's record, but nothing on the till stops a sale going through past it. It is a note for staff, not a block.",
            "On account is just another button at the payment screen, so it is easy for a cashier to tap it by mistake on what should have been a cash sale.",
            "A payment taken here shows up on the End of day report mixed into whatever payment type was chosen for it, not as its own line. There is currently no way to see, from that report alone, how much of today's cash was a fresh sale versus an old debt being paid off.",
          ],
        },
      ],
    },
  ],
};
