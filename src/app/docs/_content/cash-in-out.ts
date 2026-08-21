import { type Guide } from "./types";

/**
 * Sourced from CashInOutViewModel/CashEntryRepository: Save requires
 * Amount > 0 (zero and negative are blocked, just no upper cap and no check
 * against what is physically in the drawer), entries feed End of day's
 * expected-cash figure until a close sweeps them (ZReportId stamped) rather
 * than being scoped by date, and a separate Cash drawer button on the same
 * screen pops the drawer directly, unrelated to logging an entry.
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
          text: "Cash In / Out logs cash movements that are not a sale or a refund. Think a float top-up at the start of the day, or notes going to the safe. It does not close the register or start a shift, so use it as often as you need through the day.",
        },
      ],
    },
    {
      heading: "Opening it",
      blocks: [
        {
          kind: "p",
          text: "Open the hamburger menu and choose Cash In / Out. If you are not already signed in as one, enter a PIN with access to it.",
        },
      ],
    },
    {
      heading: "Recording an entry",
      blocks: [
        {
          kind: "p",
          text: "Pick Add cash or Remove cash, type the amount, and add a note if you want one. The note is free text; there are no preset reasons. So what shows up later in reports depends entirely on what you type here.",
        },
        {
          kind: "p",
          text: "The amount has to be more than zero. Beyond that there is no upper limit, and nothing checks it against what is actually in the drawer, so you can record a cash-out for more than the till holds. The screen keeps whichever direction you used last, since entries usually come in runs.",
        },
        {
          kind: "p",
          text: "Today's entries are listed below, newest first, each showing who recorded it and when.",
        },
        {
          kind: "p",
          text: "A separate Cash drawer button just pops the drawer open. It logs nothing, and has nothing to do with Add cash or Remove cash.",
        },
      ],
    },
    {
      heading: "How it feeds End of day",
      blocks: [
        {
          kind: "p",
          text: "Every open entry counts towards the expected cash figure at close: takings plus cash in, minus cash out. Closing sweeps everything still open into that Z-report, and from then on it stops affecting the running total.",
        },
        {
          kind: "p",
          text: "Entries get swept by being open, not by date. So a register left open past midnight simply carries its cash-in and cash-out figures into the next day instead of resetting.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "It is one drawer for the whole till, not one per user. Everyone's entries feed the same running total.",
            "Any authorized user can remove any amount with just a note, or no note at all. Keeping this permission to trusted staff is the only real control you have.",
            "There is no printed receipt for a single entry. The figures show up on the End of day report instead.",
          ],
        },
      ],
    },
  ],
};
