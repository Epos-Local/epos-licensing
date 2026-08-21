import { type Guide } from "./types";

/**
 * Sourced from DatabaseBackupService/DatabaseImportService/SyncService
 * (SettingsViewModel.cs:474-624): automatic backups default to a Backup
 * subfolder next to the database, Import database only accepts .db files
 * this app itself produced (rejects other SQLite files and anything from a
 * newer app version), always takes a fresh backup of the current database
 * before overwriting it and aborts if that fails, and strips the till's own
 * identity/licence rows so an imported database does not carry the old
 * till's terminal number onto a new machine. Separately, Export/Merge
 * changes (the same screen's "Sync with another till" block) is additive
 * rather than a replace: a merge keeps whichever side edited a row more
 * recently, holds back a deletion the till still has something depending on,
 * and runs as one transaction so a failed merge leaves the till untouched.
 */
export const databaseBackup: Guide = {
  slug: "database-backup",
  title: "Backing up and restoring your data",
  lede: "Keep a copy of everything the till holds, put it back if something goes wrong, and keep two tills in step.",
  summary: "Backing up by hand or on a schedule, restoring a backup, and syncing two tills that both keep trading.",
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
      heading: "Keeping two tills in step",
      startsNewPage: true,
      blocks: [
        {
          kind: "p",
          text: "Import database is for replacing one till wholesale. If a shop instead runs two tills side by side and wants each one to pick up what happened on the other, use Export changes and Merge changes underneath it, on the same screen, instead. These add to a till rather than replacing it.",
        },
        {
          kind: "p",
          text: "Export changes writes what has changed on this till to a file, meant for a USB stick. Take that file to the other till and use Merge changes there to bring it in. To keep both tills level, do this in both directions: export from each one and merge the other's file into it.",
        },
        {
          kind: "p",
          text: "If the same row was changed on both tills, the more recent edit wins and the older one is dropped, not kept anywhere for reference. A deletion only goes through if nothing on the receiving till still depends on that row, a sale of a since-discontinued product is the usual reason one is held back instead.",
        },
        {
          kind: "p",
          text: "A merge either goes through in full or not at all. If something in the file cannot be applied, nothing on the till is changed, and you are told what went wrong rather than being left to guess.",
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
            "Export changes and Import database are not the same thing, and picking the wrong one matters: import wipes out a till's own trading, merge only adds to it.",
          ],
        },
      ],
    },
  ],
};
