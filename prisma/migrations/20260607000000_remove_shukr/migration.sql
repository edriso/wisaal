-- Remove the gratitude (shukr) journal.
--
-- The optional journal is being dropped to keep the bot minimal. This drops the
-- per-user opt-in flag and the entries table (and its foreign key). The init
-- migration created both, so we undo them here rather than editing that
-- already-applied migration.

-- DropForeignKey
ALTER TABLE `shukr_entries` DROP FOREIGN KEY `shukr_entries_user_id_fkey`;

-- DropTable
DROP TABLE `shukr_entries`;

-- DropColumn
ALTER TABLE `users` DROP COLUMN `shukr_enabled`;
