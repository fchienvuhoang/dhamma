import { revalidateTag, unstable_cache } from "next/cache";
import { decimalToNumber } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { redactPhoneNumbers } from "@/lib/privacy";
import { makeCampaignCode } from "@/lib/text";

const PUBLIC_CAMPAIGN_DATA_CACHE_VERSION = "campaign-outflow-type-v1";
const PUBLIC_CAMPAIGN_LIST_TAG = "public-campaign-list";

export type ActivePublicCampaign = {
  code: string;
  name: string;
  description: string | null;
};

export type PublicCampaignData = {
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  income: number;
  expenses: number;
  balance: number;
  transactionCount: number;
  transactions: PublicCampaignTransaction[];
};

export type PublicCampaignTransaction = {
  id: string;
  transactionDate: string;
  createdAt: string;
  statementRow: number | null;
  description: string;
  debitAmount: number;
  creditAmount: number;
  outflowType: "DONATION" | "REFUND";
};

export async function getPublicCampaignMeta(code: string) {
  const prisma = getPrisma();
  const normalizedCode = makeCampaignCode(code);

  return prisma.campaign.findUnique({
    where: { code: normalizedCode },
    select: {
      code: true,
      name: true,
      description: true,
    },
  });
}

export async function getActivePublicCampaigns(): Promise<ActivePublicCampaign[]> {
  const prisma = getPrisma();
  return prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    select: {
      code: true,
      name: true,
      description: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getCachedActivePublicCampaigns() {
  return unstable_cache(getActivePublicCampaigns, ["active-public-campaigns"], {
    revalidate: false,
    tags: [PUBLIC_CAMPAIGN_LIST_TAG],
  })();
}

export function invalidatePublicCampaignListCache() {
  revalidateTag(PUBLIC_CAMPAIGN_LIST_TAG, { expire: 0 });
}

export async function warmPublicCampaignListCache() {
  await getCachedActivePublicCampaigns();
}

function publicCampaignTag(code: string) {
  return `public-campaign:${makeCampaignCode(code)}`;
}

export function getCachedPublicCampaignMeta(code: string) {
  const normalizedCode = makeCampaignCode(code);
  return unstable_cache(
    () => getPublicCampaignMeta(normalizedCode),
    ["public-campaign-meta", normalizedCode],
    { revalidate: false, tags: [publicCampaignTag(normalizedCode)] },
  )();
}

export async function getPublicCampaignData(code: string): Promise<PublicCampaignData | null> {
  const prisma = getPrisma();
  const normalizedCode = makeCampaignCode(code);
  const campaign = await prisma.campaign.findUnique({
    where: { code: normalizedCode },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      status: true,
    },
  });

  if (!campaign) {
    return null;
  }

  const [transactionSums, allocationSums, transactions, allocations] = await Promise.all([
    prisma.bankTransaction.aggregate({
      where: {
        campaignId: campaign.id,
        outflowType: "DONATION",
      },
      _sum: {
        creditAmount: true,
        debitAmount: true,
      },
      _count: true,
    }),
    prisma.transactionAllocation.aggregate({
      where: { campaignId: campaign.id },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.bankTransaction.findMany({
      where: {
        campaignId: campaign.id,
      },
      select: {
        id: true,
        transactionDate: true,
        createdAt: true,
        statementRow: true,
        description: true,
        debitAmount: true,
        creditAmount: true,
        outflowType: true,
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
      take: 1000,
    }),
    prisma.transactionAllocation.findMany({
      where: { campaignId: campaign.id },
      select: {
        id: true,
        amount: true,
        transaction: {
          select: {
            transactionDate: true,
            createdAt: true,
            statementRow: true,
            description: true,
          },
        },
      },
      orderBy: { transaction: { transactionDate: "desc" } },
      take: 1000,
    }),
  ]);

  const income =
    decimalToNumber(transactionSums._sum.creditAmount) +
    decimalToNumber(allocationSums._sum.amount);
  const expenses = decimalToNumber(transactionSums._sum.debitAmount);
  const publicTransactions: PublicCampaignTransaction[] = [
    ...transactions.map((transaction) => ({
      id: transaction.id,
      transactionDate: transaction.transactionDate.toISOString(),
      createdAt: transaction.createdAt.toISOString(),
      statementRow: transaction.statementRow,
      description: redactPhoneNumbers(transaction.description),
      debitAmount: decimalToNumber(transaction.debitAmount),
      creditAmount: decimalToNumber(transaction.creditAmount),
      outflowType: transaction.outflowType,
    })),
    ...allocations.map((allocation) => ({
      id: allocation.id,
      transactionDate: allocation.transaction.transactionDate.toISOString(),
      createdAt: allocation.transaction.createdAt.toISOString(),
      statementRow: allocation.transaction.statementRow,
      description: redactPhoneNumbers(allocation.transaction.description),
      debitAmount: 0,
      creditAmount: decimalToNumber(allocation.amount),
      outflowType: "DONATION" as const,
    })),
  ]
    .sort((left, right) => {
      const dateDifference =
        new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();
      if (dateDifference !== 0) return dateDifference;
      const createdDifference =
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (createdDifference !== 0) return createdDifference;
      return (right.statementRow ?? 0) - (left.statementRow ?? 0);
    })
    .slice(0, 1000);

  return {
    code: campaign.code,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    income,
    expenses,
    balance: income - expenses,
    transactionCount: transactionSums._count + allocationSums._count,
    transactions: publicTransactions,
  };
}

export function getCachedPublicCampaignData(code: string) {
  const normalizedCode = makeCampaignCode(code);
  return unstable_cache(
    () => getPublicCampaignData(normalizedCode),
    ["public-campaign-data", PUBLIC_CAMPAIGN_DATA_CACHE_VERSION, normalizedCode],
    { revalidate: false, tags: [publicCampaignTag(normalizedCode)] },
  )();
}

export function invalidatePublicCampaignCache(codes: Iterable<string | null | undefined>) {
  const normalizedCodes = new Set(
    [...codes].filter((code): code is string => Boolean(code)).map(makeCampaignCode),
  );

  for (const code of normalizedCodes) {
    revalidateTag(publicCampaignTag(code), { expire: 0 });
  }

  return [...normalizedCodes];
}

export async function warmPublicCampaignCaches(codes: Iterable<string>) {
  const normalizedCodes = [...new Set([...codes].map(makeCampaignCode))];
  await Promise.all(
    normalizedCodes.flatMap((code) => [
      getCachedPublicCampaignMeta(code),
      getCachedPublicCampaignData(code),
    ]),
  );
}
