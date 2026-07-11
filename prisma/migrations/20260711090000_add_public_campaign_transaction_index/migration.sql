-- CreateIndex
CREATE INDEX IF NOT EXISTS "BankTransaction_campaignId_transactionDate_createdAt_statementRow_idx" ON "BankTransaction"("campaignId", "transactionDate", "createdAt", "statementRow");
