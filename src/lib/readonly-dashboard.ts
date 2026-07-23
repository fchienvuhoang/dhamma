import { decimalToNumber } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";

export type ReadonlyDashboardData = {
  latestImport: {
    fileName: string;
    importedAt: string;
  } | null;
  bankAccount: {
    accountNumber: string;
    accountName: string | null;
    bankName: string;
    currentBalance: number;
    balanceAsOf: string | null;
  } | null;
  totalCampaignIncome: number;
  totalCampaignExpenses: number;
  totalCampaignBalance: number;
  campaigns: {
    id: string;
    code: string;
    name: string;
    status: "ACTIVE" | "PAUSED" | "COMPLETED";
    income: number;
    expenses: number;
    balance: number;
    transactionCount: number;
  }[];
};

export async function getReadonlyDashboardData(): Promise<ReadonlyDashboardData> {
  const prisma = getPrisma();
  const [campaigns, transactionSums, allocationSums, bankAccount, latestImport] = await Promise.all([
    prisma.campaign.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    prisma.bankTransaction.groupBy({
      by: ["campaignId"],
      where: { campaignId: { not: null }, outflowType: "DONATION" },
      _sum: { creditAmount: true, debitAmount: true },
      _count: { _all: true },
    }),
    prisma.transactionAllocation.groupBy({
      by: ["campaignId"],
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.bankAccount.findFirst({
      select: {
        accountNumber: true,
        accountName: true,
        bankName: true,
        currentBalance: true,
        balanceAsOf: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.importBatch.findFirst({
      select: {
        fileName: true,
        importedAt: true,
      },
      orderBy: { importedAt: "desc" },
    }),
  ]);

  const sumsByCampaign = new Map(
    transactionSums.map((item) => [
      item.campaignId,
      {
        income: decimalToNumber(item._sum.creditAmount),
        expenses: decimalToNumber(item._sum.debitAmount),
        transactionCount: item._count._all,
      },
    ]),
  );
  const campaignRows = campaigns.map((campaign) => {
    const sums = sumsByCampaign.get(campaign.id);
    const allocation = allocationSums.find((item) => item.campaignId === campaign.id);
    const allocatedIncome = decimalToNumber(allocation?._sum.amount);
    const allocationCount = allocation?._count._all ?? 0;
    return {
      ...campaign,
      income: (sums?.income ?? 0) + allocatedIncome,
      expenses: sums?.expenses ?? 0,
      balance: (sums?.income ?? 0) + allocatedIncome - (sums?.expenses ?? 0),
      transactionCount: (sums?.transactionCount ?? 0) + allocationCount,
    };
  });

  return {
    latestImport: latestImport
      ? {
          fileName: latestImport.fileName,
          importedAt: latestImport.importedAt.toISOString(),
        }
      : null,
    bankAccount: bankAccount
      ? {
          ...bankAccount,
          currentBalance: decimalToNumber(bankAccount.currentBalance),
          balanceAsOf: bankAccount.balanceAsOf?.toISOString() ?? null,
        }
      : null,
    totalCampaignIncome: campaignRows.reduce((total, campaign) => total + campaign.income, 0),
    totalCampaignExpenses: campaignRows.reduce(
      (total, campaign) => total + campaign.expenses,
      0,
    ),
    totalCampaignBalance: campaignRows.reduce(
      (total, campaign) => total + campaign.balance,
      0,
    ),
    campaigns: campaignRows,
  };
}
