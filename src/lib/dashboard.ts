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
  expenses: ExpenseSummary[];
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
  expenseCount: number;
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

export type ExpenseSummary = {
  id: string;
  title: string;
  amount: number;
  spentAt: string;
  payee: string | null;
  note: string | null;
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
      expenseSums,
      overallTransactionSums,
      overallExpenseSums,
      unmatchedIncome,
      transactions,
      expenses,
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
              expenses: true,
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
      prisma.expense.groupBy({
        by: ["campaignId"],
        _sum: {
          amount: true,
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
      prisma.expense.aggregate({
        _sum: {
          amount: true,
        },
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
      prisma.expense.findMany({
        include: {
          campaign: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
        take: 100,
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
    const expensesByCampaign = new Map(
      expenseSums.map((item) => [
        item.campaignId,
        {
          amount: decimalToNumber(item._sum.amount),
          count: item._count._all,
        },
      ]),
    );

    const campaignSummaries = campaigns.map((campaign) => {
      const tx = txByCampaign.get(campaign.id);
      const expense = expensesByCampaign.get(campaign.id);
      const income = tx?.income ?? 0;
      const debit = tx?.debit ?? 0;
      const expensesAmount = expense?.amount ?? 0;

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
        expenseCount: campaign._count.expenses,
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
    const totalExpenses = decimalToNumber(overallExpenseSums._sum.amount);

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
          unmatchedCount: unmatchedIncome._count,
          unmatchedIncome: decimalToNumber(unmatchedIncome._sum.creditAmount),
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
        expenses: expenses.map((expense) => ({
          id: expense.id,
          title: expense.title,
          amount: decimalToNumber(expense.amount),
          spentAt: expense.spentAt.toISOString(),
          payee: expense.payee,
          note: expense.note,
          campaign: expense.campaign,
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
