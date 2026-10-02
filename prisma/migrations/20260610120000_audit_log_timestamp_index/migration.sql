-- CreateIndex
-- Serves the default unfiltered admin audit browse (ORDER BY timestamp DESC LIMIT n)
-- and retention pruning by timestamp range. The existing composite indexes
-- ([userId, timestamp], [entity, timestamp], [action, timestamp]) cannot.
CREATE INDEX "audit_logs_timestamp_desc_idx" ON "audit_logs"("timestamp" DESC);
