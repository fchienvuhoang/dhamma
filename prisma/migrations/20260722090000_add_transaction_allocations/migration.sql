CREATE TABLE "TransactionAllocation" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransactionAllocation_transactionId_campaignId_key"
ON "TransactionAllocation"("transactionId", "campaignId");

CREATE INDEX "TransactionAllocation_campaignId_createdAt_idx"
ON "TransactionAllocation"("campaignId", "createdAt");

ALTER TABLE "TransactionAllocation"
ADD CONSTRAINT "TransactionAllocation_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionAllocation"
ADD CONSTRAINT "TransactionAllocation_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
