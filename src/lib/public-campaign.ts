import { revalidateTag, unstable_cache } from "next/cache";
import { decimalToNumber } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { redactPhoneNumbers } from "@/lib/privacy";
import { makeCampaignCode } from "@/lib/text";

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

  const [transactionSums, transactions] = await Promise.all([
    prisma.bankTransaction.aggregate({
      where: {
        campaignId: campaign.id,
      },
      _sum: {
        creditAmount: true,
        debitAmount: true,
      },
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
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
      take: 1000,
    }),
  ]);

  const income = decimalToNumber(transactionSums._sum.creditAmount);
  const expenses = decimalToNumber(transactionSums._sum.debitAmount);

  return {
    code: campaign.code,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    income,
    expenses,
    balance: income - expenses,
    transactionCount: transactionSums._count,
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      transactionDate: transaction.transactionDate.toISOString(),
      createdAt: transaction.createdAt.toISOString(),
      statementRow: transaction.statementRow,
      description: redactPhoneNumbers(transaction.description),
      debitAmount: decimalToNumber(transaction.debitAmount),
      creditAmount: decimalToNumber(transaction.creditAmount),
    })),
  };
}

export function getCachedPublicCampaignData(code: string) {
  const normalizedCode = makeCampaignCode(code);
  return unstable_cache(
    () => getPublicCampaignData(normalizedCode),
    ["public-campaign-data", normalizedCode],
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
