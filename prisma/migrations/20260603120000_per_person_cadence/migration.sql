-- Per-relative reminder cadence.
--
-- Cadence moves from one value per USER to one value per RELATIVE, so the user
-- can keep in closer touch with some people than others. Each person now
-- carries their own `cadence_days` (default weekly). Existing relatives inherit
-- their user's old global cadence so no one's rhythm changes silently, after
-- which the now-unused user-level column is dropped.

-- AddColumn: per-relative cadence, defaulting to a gentle weekly for new people.
ALTER TABLE `people` ADD COLUMN `cadence_days` INTEGER NOT NULL DEFAULT 7;

-- Backfill: every existing relative keeps the user's previous global cadence.
UPDATE `people` `p`
  JOIN `users` `u` ON `p`.`user_id` = `u`.`id`
  SET `p`.`cadence_days` = `u`.`cadence_days`;

-- DropColumn: cadence is per-relative now.
ALTER TABLE `users` DROP COLUMN `cadence_days`;
