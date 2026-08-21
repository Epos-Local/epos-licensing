import { type Guide } from "./types";

/**
 * Sourced from CashInOutViewModel/CashEntryRepository: Save only requires
 * Amount > 0, there is no cap and no check against what is physically in the
 * drawer, and entries feed End of day's expected-cash figure until a close
 * sweeps them (ZReportId stamped) rather than being scoped by date.
 */
export const cashInOut: Guide = {
  slug: "cash-in-out",
  title: "Cash In / Out",
  lede: "Log cash moving through the drawer outside of a sale, such as a float top-up or a trip to the safe.",
  summary: "How to record cash added to or taken from the drawer, and how it feeds End of day.",
  sections: [
    {
      heading: "What it does",
      blocks: [
        {
          kind: "p",
          text: "Cash In / Out is a running log of cash movements that are not a sale or a refund: putting a float in at the start of the day, taking notes to the safe, that kind of thing. It does not close the register or start a shift, so it can be used as often as needed through the day.",
        },
      ],
    },
    {
      heading: "Opening it",
      blocks: [
        {
          kind: "p",
          text: "Open the hamburger menu and choose Cash In / Out. You will need a PIN with access to it if you are not already signed in as one.",
        },
      ],
    },
    {
      heading: "Recording an entry",
      blocks: [
        {
          kind: "p",
          text: "Pick Add cash or Remove cash, type the amount, and add a note if you want one. The note is free text: there are no preset reasons, so what shows up later in reports depends entirely on what was typed here.",
        },
        {
          kind: "p",
          text: "There is no limit on the amount and nothing checks it against what is actually in the drawer, so a cash-out can be recorded for more than the till holds. The screen keeps whichever direction you last used selected, since a run of entries in the same direction is the common case.",
        },
        {
          kind: "p",
          text: "Today's entries are listed underneath as you go, newest first, each showing who recorded it and when.",
        },
      ],
    },
    {
      heading: "How it feeds End of day",
      blocks: [
        {
          kind: "p",
          text: "Every open entry counts towards the expected cash figure shown when closing the register: takings plus cash in, minus cash out. Closing sweeps everything that is still open into that Z-report, and from then on it no longer affects the running total.",
        },
        {
          kind: "p",
          text: "Because entries are swept by being open rather than by date, a register left open past midnight simply carries its cash-in and cash-out figures into the next day rather than resetting.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "This is one drawer for the whole till, not one per user: everyone's entries feed the same running total.",
            "Any authorized user can remove any amount with just a note, or no note at all. Keeping this permission to trusted staff is the only real control there is.",
            "There is no printed receipt for a single entry. The figures appear on the End of day report instead.",
          ],
        },
      ],
    },
  ],
};
