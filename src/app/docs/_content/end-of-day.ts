import { type Guide } from "./types";

/**
 * Sourced from EndOfDayService/EndOfDayViewModel: closing sweeps every open
 * Payments/CashEntries row for the terminal by stamping a ZReportId, expected
 * cash is computed (not typed), a short count asks for confirmation but does
 * not block, and "Print selected report" in History is a real reprint, not a
 * stub (despite an older note in this project's CLAUDE.md).
 */
export const endOfDay: Guide = {
  slug: "end-of-day",
  title: "End of day",
  lede: "Close the register at the end of a shift and get a Z-report of the day's cash.",
  summary: "How to close the register, count the drawer, and find past reports.",
  sections: [
    {
      heading: "What it does",
      blocks: [
        {
          kind: "p",
          text: "Closing the register locks in every sale, cash movement and payment taken since the last close, and produces a numbered Z-report of the totals. Once closed, that period cannot be reopened or edited.",
        },
      ],
    },
    {
      heading: "Opening it",
      blocks: [
        {
          kind: "p",
          text: "Open the hamburger menu and choose End of day. You will be asked for a PIN with access to it if you are not already signed in as a manager.",
        },
      ],
    },
    {
      heading: "Counting the cash",
      blocks: [
        {
          kind: "p",
          text: "Choose Cash out (yourself), Cash out all users, or Close register. The till already works out how much cash it expects in the drawer from sales, cash paid in and cash paid out. Type what you actually counted and it shows you the difference.",
        },
        {
          kind: "ul",
          items: [
            "A shortfall asks you to confirm before continuing. It does not block you.",
            "Extra cash does not ask anything.",
            "Leaving the count blank still closes the register, just with no comparison to show.",
            "Cash out only records the count for later. It does not close anything, so it can be done as often as you like through the day.",
          ],
        },
      ],
    },
    {
      heading: "Before you can close",
      blocks: [
        {
          kind: "p",
          text: "Any order left open (parked, not yet paid) blocks Close register until it is finished or cancelled.",
        },
        {
          kind: "p",
          text: "If you are closing only your own cash and a colleague still has sales sitting in the same drawer, you will see a warning about the shared drawer before you can continue.",
        },
      ],
    },
    {
      heading: "After closing",
      blocks: [
        {
          kind: "p",
          text: "You get a Z-report number straight away, with a Report button to print it on the spot.",
        },
        {
          kind: "p",
          text: "Past reports live under the History tab of the same screen. Pick one and Print selected report reprints it in full, any time.",
        },
        {
          kind: "p",
          text: "Settings -> Email -> Reporting has a Z report (end of day) toggle. Turn it on and every close is emailed to you automatically, on top of anything you print by hand.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      startsNewPage: true,
      blocks: [
        {
          kind: "ul",
          items: [
            "Closing cannot be undone. There is no reopen.",
            "Only sales rung on this till are swept in. A shop running more than one till closes each one separately.",
            "Credit and on-account payments are swept in with everything else, whether or not the customer has actually paid you back yet.",
          ],
        },
      ],
    },
  ],
};
