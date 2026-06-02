-- Per-user default reminder cadence for NEWLY added relatives.
--
-- Each relative still carries their own `people.cadence_days` (tunable from
-- /list); this is just the starting value a new relative inherits when added.
-- Defaults to a gentle weekly; users can change it from /settings.

-- AddColumn
ALTER TABLE `users` ADD COLUMN `default_cadence_days` INTEGER NOT NULL DEFAULT 7;
