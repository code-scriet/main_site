-- AddForeignKey
ALTER TABLE "executions"
ADD CONSTRAINT "executions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "user_playground_prefs"
ADD CONSTRAINT "user_playground_prefs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "snippets"
ADD CONSTRAINT "snippets_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "playground_daily_usage"
ADD CONSTRAINT "playground_daily_usage_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "playground_limit_resets"
ADD CONSTRAINT "playground_limit_resets_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
