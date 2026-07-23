-- CreateTable
CREATE TABLE "TransactionRefundAllocation" (
    "id" TEXT NOT NULL,
    "refundTransactionId" TEXT NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionRefundAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionRefundAllocation_refundTransactionId_originalTransactionId_key"
ON "TransactionRefundAllocation"("refundTransactionId", "originalTransactionId");

-- CreateIndex
CREATE INDEX "TransactionRefundAllocation_originalTransactionId_createdAt_idx"
ON "TransactionRefundAllocation"("originalTransactionId", "createdAt");

-- AddForeignKey
ALTER TABLE "TransactionRefundAllocation"
ADD CONSTRAINT "TransactionRefundAllocation_refundTransactionId_fkey"
FOREIGN KEY ("refundTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRefundAllocation"
ADD CONSTRAINT "TransactionRefundAllocation_originalTransactionId_fkey"
FOREIGN KEY ("originalTransactionId") REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
