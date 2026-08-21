import { type Guide } from "./types";

/**
 * Sourced from EndOfDayViewModel/EndOfDayService: closing sweeps every open
 * Payments/CashEntries row for the terminal by stamping a ZReportId, expected
 * cash is computed (not typed), a short count asks for confirmation but does
 * not block, "Print selected report" in History is a real reprint (despite an
 * older note in this project's CLAUDE.md), the open-orders check runs for all
 * three tiles (not only Close register), the shared-drawer notice is an
 * informational banner rather than a gate on Continue, closing itself shows
 * only a message box with no Report button (the report is printed afterward
 * from History), and X REPORT is a separate always-visible tile that prints a
 * live snapshot at any time without closing anything.
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
      heading: "A quick totals check, without closing anything",
      blocks: [
        {
          kind: "p",
          text: "The X REPORT button on this screen prints a snapshot of today's totals so far. It does not close the register or affect anything, so it can be used any time you just want to see where things stand.",
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
          kind: "p",
          text: "Choosing Close register also shows a breakdown of open transactions and each user's own totals, so you can see where the day's figure comes from before going ahead.",
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
      heading: "Before you can continue",
      blocks: [
        {
          kind: "p",
          text: "Any order left open (parked, not yet paid) blocks all three options, Cash out, Cash out all users and Close register, until it is finished or cancelled.",
        },
        {
          kind: "p",
          text: "If you are closing only your own cash and a colleague still has sales sitting in the same drawer, a notice tells you so. It is there to make sure you know, not something you need to clear before continuing.",
        },
      ],
    },
    {
      heading: "After closing",
      blocks: [
        {
          kind: "p",
          text: "Closing shows a confirmation with the Z-report number and then closes the screen. There is no print button on that confirmation itself.",
        },
        {
          kind: "p",
          text: "To print it, switch to the History tab of the same screen, find it in the list, and choose Print selected report. That works for any past report, any time, not just the one you just closed.",
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
