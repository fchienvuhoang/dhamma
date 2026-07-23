CREATE TYPE "CampaignOutflowType" AS ENUM ('DONATION', 'REFUND');

ALTER TABLE "BankTransaction"
ADD COLUMN "outflowType" "CampaignOutflowType" NOT NULL DEFAULT 'DONATION';
