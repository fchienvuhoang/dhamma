import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { toPrismaDecimal } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

const allocationSchema = z.object({
  allocations: z.array(
    z.object({
      campaignId: z.string().min(1),
      amount: z.number().positive(),
    }),
  ).min(2),
});

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = allocationSchema.parse(await request.json());
    const prisma = getPrisma();

    const campaignIds = body.allocations.map((allocation) => allocation.campaignId);
    if (new Set(campaignIds).size !== campaignIds.length) {
      return NextResponse.json(
        { error: "Mỗi thiện pháp chỉ được xuất hiện một lần trong phần phân bổ." },
        { status: 400 },
      );
    }

    const transaction = await prisma.bankTransaction.findUnique({
      where: { id },
      include: {
        campaign: { select: { code: true } },
        allocations: { include: { campaign: { select: { code: true } } } },
        _count: { select: { receivedRefundLinks: true } },
      },
    });
    if (!transaction) {
      return NextResponse.json({ error: "Không tìm thấy giao dịch." }, { status: 404 });
    }

    const creditAmount = Number(transaction.creditAmount);
    if (creditAmount <= 0) {
      return NextResponse.json(
        { error: "Chỉ có thể chia giao dịch tiền vào." },
        { status: 400 },
      );
    }
    if (transaction._count.receivedRefundLinks > 0) {
      return NextResponse.json(
        { error: "Không thể chia lại vì khoản nhận này đã được liên kết với một khoản hoàn." },
        { status: 400 },
      );
    }

    const allocatedAmount = body.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (toMinorUnits(allocatedAmount) !== toMinorUnits(creditAmount)) {
      return NextResponse.json(
        { error: `Tổng tiền phân bổ phải bằng ${creditAmount.toLocaleString("vi-VN")} ₫.` },
        { status: 400 },
      );
    }

    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: campaignIds }, status: { not: "COMPLETED" } },
      select: { id: true, code: true },
    });
    if (campaigns.length !== campaignIds.length) {
      return NextResponse.json(
        { error: "Có thiện pháp không tồn tại hoặc đã hoàn tất." },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.transactionAllocation.deleteMany({ where: { transactionId: id } });
      await tx.transactionAllocation.createMany({
        data: body.allocations.map((allocation) => ({
          transactionId: id,
          campaignId: allocation.campaignId,
          amount: toPrismaDecimal(allocation.amount),
        })),
      });
      await tx.bankTransaction.update({
        where: { id },
        data: {
          campaignId: null,
          matchedKeyword: "Chia cho nhiều thiện pháp",
          classificationStatus: "MANUAL",
        },
      });
    });

    const affectedCodes = invalidatePublicCampaignCache([
      transaction.campaign?.code,
      ...transaction.allocations.map((allocation) => allocation.campaign.code),
      ...campaigns.map((campaign) => campaign.code),
    ]);
    await warmPublicCampaignCaches(affectedCodes);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

function toMinorUnits(value: number) {
  return Math.round(value * 100);
}
