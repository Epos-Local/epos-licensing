import { type Guide } from "./types";

/**
 * Sourced from UserEditViewModel/SecurityKey/User: access level is a number
 * (Staff 10, Manager 50, Administrator 100) with the Staff/Manager/
 * Administrator buttons just presets onto it, a user can never grant a level
 * above their own, PINs are globally unique since sign-in is PIN-only with no
 * username, and sandbox mode's Manager gate is hardcoded rather than a
 * SecurityKey row, so it deliberately will not appear on the Security tab.
 */
export const usersAndPermissions: Guide = {
  slug: "users-and-permissions",
  title: "Users and permissions",
  lede: "Give each member of staff their own PIN, and decide what it lets them do.",
  summary: "Setting up staff logins, PIN resets, and what each access level unlocks.",
  sections: [
    {
      heading: "Change the default PIN first",
      blocks: [
        {
          kind: "p",
          text: "A new till starts with one Admin user and PIN `1234`. Change it before the till goes live: Management -> Users & security -> Users, edit Admin, set a new PIN.",
        },
      ],
    },
    {
      heading: "Adding a staff member",
      blocks: [
        {
          kind: "p",
          text: "Management -> Users & security -> Users -> add a user. Give them a name and a PIN, and pick Staff, Manager or Administrator, which fills in an access level for you. You will not see that number on the screen day to day, but it is what everything else in this section checks against.",
        },
        {
          kind: "p",
          text: "Signing in is PIN only, with no separate username, so every PIN on the till has to be different from every other one. Trying to save a PIN already in use will be rejected.",
        },
      ],
    },
    {
      heading: "What each level unlocks",
      blocks: [
        {
          kind: "p",
          text: "Higher numbers can do more, and include everything a lower level can. A Manager can do anything a Staff member can, and an Administrator can do anything a Manager can.",
        },
        {
          kind: "table",
          caption: "Examples of what each level gates",
          head: ["Action", "Needs at least"],
          rows: [
            ["Voiding an order", "Manager"],
            ["Opening Management or Settings", "Manager"],
            ["Turning on sandbox (training) mode", "Manager"],
            ["Releasing this till's licence", "Administrator"],
          ],
        },
        {
          kind: "p",
          text: "You cannot hand out more than you hold yourself: a Manager setting up a new user cannot make them an Administrator, only an Administrator can create another Administrator.",
        },
      ],
    },
    {
      heading: "Resetting a forgotten PIN",
      blocks: [
        {
          kind: "p",
          text: "Management -> Staff passwords is the quick path: pick the user and set a new PIN, no old one needed. It only changes PINs, so use Users & security if you also need to change someone's access level.",
        },
        {
          kind: "p",
          text: "There is no remote or self-service reset. If every Manager and Administrator PIN on a till is lost at once, the only way back in is through support, quoting the till's reference shown on the sign-in screen.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "A user with open orders cannot be deactivated until those orders are finished or cancelled.",
            "Sandbox mode is deliberately not something you can grant or take away here; it always needs Manager level or above, fixed in the till itself.",
          ],
        },
      ],
    },
  ],
};
