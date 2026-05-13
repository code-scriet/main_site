-- CreateIndex
CREATE INDEX "audit_logs_entity_timestamp_desc_idx" ON "audit_logs"("entity", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_timestamp_desc_idx" ON "audit_logs"("action", "timestamp" DESC);
