import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { decimalToNumber, toPrismaDecimal } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

const refundLinksSchema = z.object({
  links: z.array(
    z.object({
      originalTransactionId: z.string().min(1),
      amount: z.number().positive(),
    }),
  ).min(1),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const prisma = getPrisma();
    const refundTransaction = await prisma.bankTransaction.findUnique({
      where: { id },
      select: {
        id: true,
        campaignId: true,
        debitAmount: true,
        outflowType: true,
        refundLinks: {
          select: { originalTransactionId: true, amount: true },
        },
      },
    });

    const validationError = validateRefundTransaction(refundTransaction);
    if (validationError) return validationError;
    const campaignId = refundTransaction!.campaignId!;

    const candidates = await prisma.bankTransaction.findMany({
      where: {
        creditAmount: { gt: 0 },
        OR: [
          { campaignId },
          { allocations: { some: { campaignId } } },
        ],
      },
      select: {
        id: true,
        transactionDate: true,
        description: true,
        detail: true,
        creditAmount: true,
        campaignId: true,
        allocations: {
          where: { campaignId },
          select: { amount: true },
        },
        receivedRefundLinks: {
          where: { refundTransaction: { campaignId } },
          select: { refundTransactionId: true, amount: true },
        },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
      take: 1000,
    });

    return NextResponse.json({
      refundAmount: decimalToNumber(refundTransaction!.debitAmount),
      links: refundTransaction!.refundLinks.map((link) => ({
        originalTransactionId: link.originalTransactionId,
        amount: decimalToNumber(link.amount),
      })),
      candidates: candidates.map((candidate) => {
        const originalAmount = candidate.campaignId === campaignId
          ? decimalToNumber(candidate.creditAmount)
          : decimalToNumber(candidate.allocations[0]?.amount);
        const refundedAmount = candidate.receivedRefundLinks
          .filter((link) => link.refundTransactionId !== id)
          .reduce((sum, link) => sum + decimalToNumber(link.amount), 0);

        return {
          id: candidate.id,
          transactionDate: candidate.transactionDate.toISOString(),
          description: candidate.description,
          detail: candidate.detail,
          originalAmount,
          refundedAmount,
          refundableAmount: Math.max(0, originalAmount - refundedAmount),
        };
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = refundLinksSchema.parse(await request.json());
    const originalIds = body.links.map((link) => link.originalTransactionId);
    if (new Set(originalIds).size !== originalIds.length) {
      return NextResponse.json({ error: "Mỗi khoản nhận chỉ được liên kết một lần." }, { status: 400 });
    }

    const prisma = getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const refundTransaction = await tx.bankTransaction.findUnique({
        where: { id },
        select: {
          campaignId: true,
          debitAmount: true,
          outflowType: true,
          campaign: { select: { code: true } },
        },
      });
      const validationError = validateRefundTransaction(refundTransaction);
      if (validationError) throw new Error(await responseError(validationError));

      const refundAmount = decimalToNumber(refundTransaction!.debitAmount);
      const linkedAmount = body.links.reduce((sum, link) => sum + link.amount, 0);
      if (toMinorUnits(linkedAmount) !== toMinorUnits(refundAmount)) {
        throw new Error(`Tổng tiền liên kết phải bằng khoản hoàn ${refundAmount.toLocaleString("vi-VN")} ₫.`);
      }

      const campaignId = refundTransaction!.campaignId!;
      const originals = await tx.bankTransaction.findMany({
        where: { id: { in: originalIds }, creditAmount: { gt: 0 } },
        select: {
          id: true,
          campaignId: true,
          creditAmount: true,
          allocations: { where: { campaignId }, select: { amount: true } },
          receivedRefundLinks: {
            where: {
              refundTransactionId: { not: id },
              refundTransaction: { campaignId },
            },
            select: { amount: true },
          },
        },
      });
      if (originals.length !== originalIds.length) {
        throw new Error("Có khoản nhận không tồn tại hoặc không phải giao dịch tiền vào.");
      }

      const originalsById = new Map(originals.map((original) => [original.id, original]));
      for (const link of body.links) {
        const original = originalsById.get(link.originalTransactionId)!;
        const originalAmount = original.campaignId === campaignId
          ? decimalToNumber(original.creditAmount)
          : decimalToNumber(original.allocations[0]?.amount);
        if (originalAmount <= 0) {
          throw new Error("Khoản nhận được chọn không thuộc cùng thiện pháp với khoản hoàn.");
        }
        const previouslyRefunded = original.receivedRefundLinks.reduce(
          (sum, item) => sum + decimalToNumber(item.amount),
          0,
        );
        if (toMinorUnits(previouslyRefunded + link.amount) > toMinorUnits(originalAmount)) {
          throw new Error(
            `Số tiền hoàn vượt quá phần còn lại của khoản nhận ${originalAmount.toLocaleString("vi-VN")} ₫.`,
          );
        }
      }

      await tx.transactionRefundAllocation.deleteMany({ where: { refundTransactionId: id } });
      await tx.transactionRefundAllocation.createMany({
        data: body.links.map((link) => ({
          refundTransactionId: id,
          originalTransactionId: link.originalTransactionId,
          amount: toPrismaDecimal(link.amount),
        })),
      });

      return { campaignCode: refundTransaction!.campaign!.code };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const affectedCodes = invalidatePublicCampaignCache([result.campaignCode]);
    await warmPublicCampaignCaches(affectedCodes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

function validateRefundTransaction(transaction: {
  campaignId: string | null;
  debitAmount: Prisma.Decimal;
  outflowType: "DONATION" | "REFUND";
} | null) {
  if (!transaction) {
    return NextResponse.json({ error: "Không tìm thấy giao dịch hoàn lại." }, { status: 404 });
  }
  if (decimalToNumber(transaction.debitAmount) <= 0 || transaction.outflowType !== "REFUND") {
    return NextResponse.json({ error: "Giao dịch phải là khoản chuyển ra loại Hoàn lại." }, { status: 400 });
  }
  if (!transaction.campaignId) {
    return NextResponse.json({ error: "Hãy gán khoản hoàn vào một thiện pháp trước." }, { status: 400 });
  }
  return null;
}

async function responseError(response: NextResponse) {
  const body = await response.json() as { error?: string };
  return body.error ?? "Giao dịch hoàn lại chưa hợp lệ.";
}

function toMinorUnits(value: number) {
  return Math.round(value * 100);
}
