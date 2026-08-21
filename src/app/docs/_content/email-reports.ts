import { type Guide } from "./types";

/**
 * Sourced from ScheduledReportEmailService/EmailReportScheduler/
 * SettingsViewModel: recipients are one shared list for every report type
 * (not per-report), periodic sends only run while the app itself is open (an
 * in-process timer, not a Windows service), a failed periodic send is silent
 * and simply retried next minute, "Send if empty" off means a quiet period
 * sends nothing at all rather than an empty report, the attachment formats
 * are PDF and Excel (there is no CSV option), and Email -> General also has
 * a Bcc field plus default Subject/Message text used as a fallback for
 * customer-facing emails, separate from Reporting's own Subject/Message pair
 * used for the scheduled report emails specifically.
 */
export const emailReports: Guide = {
  slug: "email-reports",
  title: "Email and scheduled reports",
  lede: "Have reports and your end of day emailed to you automatically, instead of only ever printed.",
  summary: "Setting up outgoing email, and choosing which reports get sent and how often.",
  sections: [
    {
      heading: "Setting up outgoing email",
      blocks: [
        {
          kind: "p",
          text: "Settings -> Email -> General asks for a mail server: host, port, whether it uses SSL, and a username and password to send through. It works with any ordinary SMTP provider, not just one specific one, though some, Gmail included, will need an app password rather than your normal one before they will accept a login like this.",
        },
        {
          kind: "p",
          text: "The same screen has a Bcc field for anyone who should quietly get a copy of every email the till sends, and default Subject and Message text used to fill in customer-facing emails, such as a receipt, when nothing more specific has been set for them.",
        },
        {
          kind: "p",
          text: "Send test email saves what you have entered and sends a message to that same address, so you can check it works before relying on it.",
        },
      ],
    },
    {
      heading: "Choosing what gets sent",
      blocks: [
        {
          kind: "p",
          text: "Settings -> Email -> Reporting has a Report selection list covering most of the reports on the till: daily sales, best sellers, stock movement and more. Tick whichever ones you want emailed. Its own Subject and Message fields here are just for these scheduled report emails, separate from the general ones on the previous screen.",
        },
        {
          kind: "p",
          text: "The Z report (end of day) and X report have their own toggles alongside it. Turn on the Z report and it is emailed automatically every time the register is closed, on top of anything you print by hand.",
        },
        {
          kind: "p",
          text: "Reports go out as PDF, Excel, or both, whichever you tick. There is no plain summary in the body of the email itself; the reports are always attachments.",
        },
      ],
    },
    {
      heading: "Sending on a schedule",
      blocks: [
        {
          kind: "p",
          text: "Turn on Send email periodically and set an interval in minutes to have reports sent through the day rather than only when the register closes, restricted to whatever business hours you set.",
        },
        {
          kind: "p",
          text: "A period with nothing new to report sends nothing at all, unless Send if empty is turned on. A quiet morning with no email is normal in that case, not a sign something is broken.",
        },
      ],
    },
    {
      heading: "Who receives them",
      blocks: [
        {
          kind: "p",
          text: "One list of recipients covers everything you have selected. There is no way to send different reports to different people; whoever is on the list gets whatever is ticked.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "Scheduled sending only runs while the till's app is open. Close it and nothing goes out until it is running again.",
            "The till needs to be online at the moment a report is due. If it is not, that send is simply missed, with no queue to catch up later.",
            "A failed send in the background is not shown anywhere. It quietly tries again the next time it is due. Send test email is the only place a failure is shown to you directly.",
          ],
        },
      ],
    },
  ],
};
