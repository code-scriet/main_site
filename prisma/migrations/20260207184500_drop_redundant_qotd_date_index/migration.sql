-- Drop redundant index: qotd.date is already indexed by qotd_date_key unique constraint
DROP INDEX IF EXISTS "qotd_date_idx";
