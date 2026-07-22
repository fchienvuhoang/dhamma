import { decimalToNumber } from "@/lib/money";
import { DatabaseNotConfiguredError, getPrisma } from "@/lib/prisma";

export type DashboardState =
  | {
      ok: true;
      data: DashboardData;
    }
  | {
      ok: false;
      reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_ERROR";
      message: string;
    };

export type DashboardData = {
  overview: {
    totalIncome: number;
    totalDebit: number;
    totalExpenses: number;
    trackedFundBalance: number;
    bankBalance: number;
    transactionCount: number;
    unmatchedCount: number;
    unmatchedIncome: number;
    unmatchedDebit: number;
  };
  bankAccount: {
    accountNumber: string;
    accountName: string | null;
    bankName: string;
    currency: string;
    currentBalance: number;
    balanceAsOf: string | null;
  } | null;
  campaigns: CampaignSummary[];
  transactions: TransactionSummary[];
  debitTransactions: TransactionSummary[];
  latestImport: {
    fileName: string;
    importedAt: string;
    totalRows: number;
    insertedRows: number;
    duplicateRows: number;
    unmatchedRows: number;
  } | null;
};

export type CampaignSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  income: number;
  debit: number;
  expenses: number;
  balance: number;
  transactionCount: number;
  keywords: {
    id: string;
    keyword: string;
    normalizedKeyword: string;
    matchType: "CONTAINS" | "EXACT" | "REGEX";
    active: boolean;
  }[];
};

export type TransactionSummary = {
  id: string;
  transactionDate: string;
  createdAt: string;
  statementRow: number | null;
  description: string;
  detail: string;
  debitAmount: number;
  creditAmount: number;
  balanceAfter: number | null;
  matchedKeyword: string | null;
  classificationStatus: "MATCHED" | "UNMATCHED" | "MANUAL";
  campaign: {
    id: string;
    code: string;
    name: string;
  } | null;
  allocations: {
    id: string;
    amount: number;
    campaign: {
      id: string;
      code: string;
      name: string;
    };
  }[];
};

export async function getDashboardState(): Promise<DashboardState> {
  try {
    const prisma = getPrisma();

    const [
      campaigns,
      transactionSums,
      allocationSums,
      overallTransactionSums,
      unmatchedIncome,
      unmatchedDebit,
      unmatchedTransactionCount,
      transactions,
      debitTransactions,
      bankAccount,
      latestImport,
    ] = await Promise.all([
      prisma.campaign.findMany({
        include: {
          keywords: {
            orderBy: { createdAt: "asc" },
          },
          _count: {
            select: {
              transactions: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      }),
      prisma.bankTransaction.groupBy({
        by: ["campaignId"],
        _sum: {
          creditAmount: true,
          debitAmount: true,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.transactionAllocation.groupBy({
        by: ["campaignId"],
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.bankTransaction.aggregate({
        _sum: {
          creditAmount: true,
          debitAmount: true,
        },
        _count: true,
      }),
      prisma.bankTransaction.aggregate({
        where: {
          campaignId: null,
          allocations: { none: {} },
          creditAmount: {
            gt: 0,
          },
        },
        _sum: {
          creditAmount: true,
        },
        _count: true,
      }),
      prisma.bankTransaction.aggregate({
        where: {
          campaignId: null,
          allocations: { none: {} },
          debitAmount: {
            gt: 0,
          },
        },
        _sum: {
          debitAmount: true,
        },
        _count: true,
      }),
      prisma.bankTransaction.count({
        where: {
          campaignId: null,
          allocations: { none: {} },
        },
      }),
      prisma.bankTransaction.findMany({
        include: {
          campaign: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          allocations: {
            include: { campaign: { select: { id: true, code: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
        take: 500,
      }),
      prisma.bankTransaction.findMany({
        where: {
          debitAmount: {
            gt: 0,
          },
        },
        include: {
          campaign: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          allocations: {
            include: { campaign: { select: { id: true, code: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
        take: 500,
      }),
      prisma.bankAccount.findFirst({
        orderBy: { updatedAt: "desc" },
      }),
      prisma.importBatch.findFirst({
        orderBy: { importedAt: "desc" },
      }),
    ]);

    const txByCampaign = new Map(
      transactionSums.map((item) => [
        item.campaignId,
        {
          income: decimalToNumber(item._sum.creditAmount),
          debit: decimalToNumber(item._sum.debitAmount),
          count: item._count._all,
        },
      ]),
    );
    const allocationsByCampaign = new Map(
      allocationSums.map((item) => [
        item.campaignId,
        {
          income: decimalToNumber(item._sum.amount),
          count: item._count._all,
        },
      ]),
    );

    const campaignSummaries = campaigns.map((campaign) => {
      const tx = txByCampaign.get(campaign.id);
      const allocation = allocationsByCampaign.get(campaign.id);
      const income = (tx?.income ?? 0) + (allocation?.income ?? 0);
      const debit = tx?.debit ?? 0;
      const expensesAmount = debit;

      return {
        id: campaign.id,
        code: campaign.code,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        income,
        debit,
        expenses: expensesAmount,
        balance: income - expensesAmount,
        transactionCount: (tx?.count ?? 0) + (allocation?.count ?? 0),
        keywords: campaign.keywords.map((keyword) => ({
          id: keyword.id,
          keyword: keyword.keyword,
          normalizedKeyword: keyword.normalizedKeyword,
          matchType: keyword.matchType,
          active: keyword.active,
        })),
      } satisfies CampaignSummary;
    });

    const totalIncome = decimalToNumber(overallTransactionSums._sum.creditAmount);
    const totalDebit = decimalToNumber(overallTransactionSums._sum.debitAmount);
    const totalExpenses = totalDebit;

    return {
      ok: true,
      data: {
        overview: {
          totalIncome,
          totalDebit,
          totalExpenses,
          trackedFundBalance: campaignSummaries.reduce((sum, campaign) => sum + campaign.balance, 0),
          bankBalance: decimalToNumber(bankAccount?.currentBalance),
          transactionCount: overallTransactionSums._count,
          unmatchedCount: unmatchedTransactionCount,
          unmatchedIncome: decimalToNumber(unmatchedIncome._sum.creditAmount),
          unmatchedDebit: decimalToNumber(unmatchedDebit._sum.debitAmount),
        },
        bankAccount: bankAccount
          ? {
              accountNumber: bankAccount.accountNumber,
              accountName: bankAccount.accountName,
              bankName: bankAccount.bankName,
              currency: bankAccount.currency,
              currentBalance: decimalToNumber(bankAccount.currentBalance),
              balanceAsOf: bankAccount.balanceAsOf?.toISOString() ?? null,
            }
          : null,
        campaigns: campaignSummaries,
        transactions: transactions.map((transaction) => ({
          id: transaction.id,
          transactionDate: transaction.transactionDate.toISOString(),
          createdAt: transaction.createdAt.toISOString(),
          statementRow: transaction.statementRow,
          description: transaction.description,
          detail: transaction.detail,
          debitAmount: decimalToNumber(transaction.debitAmount),
          creditAmount: decimalToNumber(transaction.creditAmount),
          balanceAfter:
            transaction.balanceAfter == null ? null : decimalToNumber(transaction.balanceAfter),
          matchedKeyword: transaction.matchedKeyword,
          classificationStatus: transaction.classificationStatus,
          campaign: transaction.campaign,
          allocations: transaction.allocations.map((allocation) => ({
            id: allocation.id,
            amount: decimalToNumber(allocation.amount),
            campaign: allocation.campaign,
          })),
        })),
        debitTransactions: debitTransactions.map((transaction) => ({
          id: transaction.id,
          transactionDate: transaction.transactionDate.toISOString(),
          createdAt: transaction.createdAt.toISOString(),
          statementRow: transaction.statementRow,
          description: transaction.description,
          detail: transaction.detail,
          debitAmount: decimalToNumber(transaction.debitAmount),
          creditAmount: decimalToNumber(transaction.creditAmount),
          balanceAfter:
            transaction.balanceAfter == null ? null : decimalToNumber(transaction.balanceAfter),
          matchedKeyword: transaction.matchedKeyword,
          classificationStatus: transaction.classificationStatus,
          campaign: transaction.campaign,
          allocations: transaction.allocations.map((allocation) => ({
            id: allocation.id,
            amount: decimalToNumber(allocation.amount),
            campaign: allocation.campaign,
          })),
        })),
        latestImport: latestImport
          ? {
              fileName: latestImport.fileName,
              importedAt: latestImport.importedAt.toISOString(),
              totalRows: latestImport.totalRows,
              insertedRows: latestImport.insertedRows,
              duplicateRows: latestImport.duplicateRows,
              unmatchedRows: latestImport.unmatchedRows,
            }
          : null,
      },
    };
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return {
        ok: false,
        reason: "DATABASE_NOT_CONFIGURED",
        message: "DATABASE_URL chưa được cấu hình.",
      };
    }

    return {
      ok: false,
      reason: "DATABASE_ERROR",
      message: error instanceof Error ? error.message : "Không đọc được dữ liệu dashboard.",
    };
  }
}
