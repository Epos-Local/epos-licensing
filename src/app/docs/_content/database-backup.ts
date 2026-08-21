import { type Guide } from "./types";

/**
 * Sourced from DatabaseBackupService/DatabaseImportService: automatic
 * backups default to a Backup subfolder next to the database, Import
 * database only accepts .db files this app itself produced (rejects other
 * SQLite files and anything from a newer app version), always takes a fresh
 * backup of the current database before overwriting it and aborts if that
 * fails, and strips the till's own identity/licence rows so an imported
 * database does not carry the old till's terminal number onto a new machine.
 */
export const databaseBackup: Guide = {
  slug: "database-backup",
  title: "Backing up and restoring your data",
  lede: "Keep a copy of everything the till holds, and put it back if something goes wrong.",
  summary: "Backing up by hand or on a schedule, and restoring a backup onto a till.",
  sections: [
    {
      heading: "Backing up by hand",
      blocks: [
        {
          kind: "p",
          text: "Settings -> Database -> Backup database, and choose where to save it. It is a single file, everything the till holds in one place.",
        },
      ],
    },
    {
      heading: "Backing up automatically",
      blocks: [
        {
          kind: "p",
          text: "Turn on Automatic backups in the same screen, and choose when: on every start, on every close, every so many hours, or any mix of the three. Leave the backup location blank and it saves next to the database itself, in a Backup folder.",
        },
        {
          kind: "p",
          text: "If you set your own backup folder, you can also turn on Delete old backups automatically and say how many days to keep them for, so the folder does not grow forever.",
        },
        {
          kind: "p",
          text: "There is no reminder if backups stop happening. If a folder gets deleted or a drive goes missing, nothing on screen will tell you.",
        },
      ],
    },
    {
      heading: "Restoring a backup",
      blocks: [
        {
          kind: "p",
          text: "Settings -> Database -> Import database, and pick the backup file. You will be warned that this replaces everything on the till, sales, products and settings included, before it goes ahead.",
        },
        {
          kind: "p",
          text: "The till closes itself once the import finishes, and needs opening again afterward.",
        },
        {
          kind: "p",
          text: "Before it changes anything, the till backs up what is currently on it, in case the import turns out to be the wrong file. If that safety backup fails to save, the import stops rather than risking your current data.",
        },
      ],
    },
    {
      heading: "Moving a backup to a different till",
      blocks: [
        {
          kind: "p",
          text: "This is the normal way to set up a replacement till: import an existing backup onto it. The till's own identity, its terminal number and licence, are not carried over, so the new machine gets its own rather than clashing with the one the backup came from.",
        },
      ],
    },
    {
      heading: "Worth knowing",
      blocks: [
        {
          kind: "ul",
          items: [
            "Only a .db file this app made can be imported. A file from a newer version of the app than what is installed will be rejected too.",
            "Restoring is a full replace, not a merge. Anything rung up since the backup was taken is gone once you import it.",
          ],
        },
      ],
    },
  ],
};
