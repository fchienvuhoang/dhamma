import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { classifyDescription, type KeywordRule } from "@/lib/classifier";
import { toPrismaDecimal } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { parseTechcombankStatement } from "@/lib/techcombank";
import { normalizeTransferText } from "@/lib/text";

export type ImportResult = {
  batchId: string;
  fileName: string;
  totalRows: number;
  insertedRows: number;
  duplicateRows: number;
  unmatchedRows: number;
  accountNumber: string | null;
  closingBalance: number | null;
};

export async function importTechcombankStatement(fileName: string, buffer: Buffer) {
  const prisma = getPrisma();
  const parsed = parseTechcombankStatement(buffer);
  const rules = await loadKeywordRules(prisma);

  const uniqueRows = new Map<string, (typeof parsed.rows)[number]>();
  for (const row of parsed.rows) {
    if (!uniqueRows.has(row.detail)) {
      uniqueRows.set(row.detail, row);
    }
  }

  return prisma.$transaction(async (tx) => {
    const accountNumber = parsed.meta.accountNumber ?? "TECHCOMBANK_UNKNOWN";
    const account = await tx.bankAccount.upsert({
      where: { accountNumber },
      update: {
        bankName: parsed.meta.sourceBank,
        accountName: parsed.meta.accountName,
        currency: parsed.meta.currency,
        currentBalance: toPrismaDecimal(parsed.meta.closingBalance ?? 0),
        balanceAsOf: parsed.meta.toDate,
      },
      create: {
        bankName: parsed.meta.sourceBank,
        accountNumber,
        accountName: parsed.meta.accountName,
        currency: parsed.meta.currency,
        currentBalance: toPrismaDecimal(parsed.meta.closingBalance ?? 0),
        balanceAsOf: parsed.meta.toDate,
      },
    });

    const batch = await tx.importBatch.create({
      data: {
        fileName,
        sourceBank: parsed.meta.sourceBank,
        accountId: account.id,
        fromDate: parsed.meta.fromDate,
        toDate: parsed.meta.toDate,
        openingBalance:
          parsed.meta.openingBalance == null ? null : toPrismaDecimal(parsed.meta.openingBalance),
        closingBalance:
          parsed.meta.closingBalance == null ? null : toPrismaDecimal(parsed.meta.closingBalance),
        totalRows: parsed.rows.length,
      },
    });

    const details = [...uniqueRows.keys()];
    const existing = await tx.bankTransaction.findMany({
      where: { detail: { in: details } },
      select: { detail: true },
    });
    const existingDetails = new Set(existing.map((item) => item.detail));
    const insertableRows = [...uniqueRows.values()].filter((row) => !existingDetails.has(row.detail));

    const data = insertableRows.map((row) => {
      const classification = classifyDescription(row.description, rules);

      return {
        accountId: account.id,
        importBatchId: batch.id,
        campaignId: classification.campaignId,
        transactionDate: row.transactionDate,
        statementRow: row.statementRow,
        description: row.description,
        normalizedDescription: normalizeTransferText(row.description),
        detail: row.detail,
        debitAmount: toPrismaDecimal(row.debitAmount),
        creditAmount: toPrismaDecimal(row.creditAmount),
        balanceAfter: row.balanceAfter == null ? null : toPrismaDecimal(row.balanceAfter),
        matchedKeyword: classification.matchedKeyword,
        classificationStatus: classification.status,
        raw: row.raw as Prisma.InputJsonObject,
      };
    });

    const created = data.length
      ? await tx.bankTransaction.createMany({
          data,
          skipDuplicates: true,
        })
      : { count: 0 };

    const duplicateRows = parsed.rows.length - created.count;
    const unmatchedRows = data.filter((row) => row.classificationStatus === "UNMATCHED").length;

    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        insertedRows: created.count,
        duplicateRows,
        unmatchedRows,
      },
    });

    return {
      batchId: batch.id,
      fileName,
      totalRows: parsed.rows.length,
      insertedRows: created.count,
      duplicateRows,
      unmatchedRows,
      accountNumber: parsed.meta.accountNumber,
      closingBalance: parsed.meta.closingBalance,
    } satisfies ImportResult;
  });
}

export async function reclassifyImportedTransactions() {
  const prisma = getPrisma();
  const rules = await loadKeywordRules(prisma);
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      classificationStatus: {
        not: "MANUAL",
      },
    },
    select: {
      id: true,
      description: true,
    },
  });

  let matchedRows = 0;
  let unmatchedRows = 0;

  const updates = transactions.map((transaction) => {
    const classification = classifyDescription(transaction.description, rules);
    if (classification.status === "MATCHED") {
      matchedRows += 1;
    } else {
      unmatchedRows += 1;
    }

    return prisma.bankTransaction.update({
      where: { id: transaction.id },
      data: {
        campaignId: classification.campaignId,
        matchedKeyword: classification.matchedKeyword,
        classificationStatus: classification.status,
        normalizedDescription: normalizeTransferText(transaction.description),
      },
    });
  });

  for (let index = 0; index < updates.length; index += 20) {
    await Promise.all(updates.slice(index, index + 20));
  }

  return {
    totalRows: transactions.length,
    matchedRows,
    unmatchedRows,
  };
}

async function loadKeywordRules(prisma: PrismaClient): Promise<KeywordRule[]> {
  const keywords = await prisma.campaignKeyword.findMany({
    where: {
      active: true,
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
  });

  return keywords.map((keyword) => ({
    campaignId: keyword.campaign.id,
    campaignCode: keyword.campaign.code,
    campaignName: keyword.campaign.name,
    keyword: keyword.keyword,
    normalizedKeyword: keyword.normalizedKeyword,
    matchType: keyword.matchType,
  }));
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
