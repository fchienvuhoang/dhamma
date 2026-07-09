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
};

export async function getDashboardState(): Promise<DashboardState> {
  try {
    const prisma = getPrisma();

    const [
      campaigns,
      transactionSums,
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
        },
        orderBy: [{ transactionDate: "desc" }, { statementRow: "desc" }, { createdAt: "desc" }],
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
        },
        orderBy: [{ transactionDate: "desc" }, { statementRow: "desc" }, { createdAt: "desc" }],
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

    const campaignSummaries = campaigns.map((campaign) => {
      const tx = txByCampaign.get(campaign.id);
      const income = tx?.income ?? 0;
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
        transactionCount: campaign._count.transactions,
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
        })),
        debitTransactions: debitTransactions.map((transaction) => ({
          id: transaction.id,
          transactionDate: transaction.transactionDate.toISOString(),
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
