import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

const updateTransactionSchema = z.object({
  campaignId: z.string().optional().nullable(),
  outflowType: z.enum(["DONATION", "REFUND"]).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = updateTransactionSchema.parse(await request.json());
    const prisma = getPrisma();

    const previousTransaction = await prisma.bankTransaction.findUnique({
      where: { id },
      select: {
        debitAmount: true,
        campaignId: true,
        outflowType: true,
        _count: { select: { receivedRefundLinks: true } },
        campaign: { select: { code: true } },
        allocations: { select: { campaign: { select: { code: true } } } },
      },
    });
    if (body.outflowType && Number(previousTransaction?.debitAmount ?? 0) <= 0) {
      return NextResponse.json(
        { error: "Chỉ giao dịch chuyển ra mới có thể đặt là cúng dường hoặc hoàn lại." },
        { status: 400 },
      );
    }
    const campaignChanged =
      body.campaignId !== undefined && (body.campaignId || null) !== previousTransaction?.campaignId;
    if (campaignChanged && (previousTransaction?._count.receivedRefundLinks ?? 0) > 0) {
      return NextResponse.json(
        { error: "Không thể đổi thiện pháp vì khoản nhận này đã được liên kết với một khoản hoàn." },
        { status: 400 },
      );
    }
    const transaction = await prisma.$transaction(async (tx) => {
      const noLongerRefund = body.outflowType !== undefined && body.outflowType !== "REFUND";
      if (campaignChanged || noLongerRefund) {
        await tx.transactionRefundAllocation.deleteMany({ where: { refundTransactionId: id } });
      }
      await tx.transactionAllocation.deleteMany({ where: { transactionId: id } });
      return tx.bankTransaction.update({
        where: { id },
        data: {
          ...(body.campaignId !== undefined
            ? {
                campaignId: body.campaignId || null,
                matchedKeyword: body.campaignId ? "Gán thủ công" : null,
                classificationStatus: body.campaignId ? ("MANUAL" as const) : ("UNMATCHED" as const),
              }
            : {}),
          ...(body.outflowType ? { outflowType: body.outflowType } : {}),
        },
        include: { campaign: { select: { code: true } } },
      });
    });

    const affectedCodes = invalidatePublicCampaignCache([
      previousTransaction?.campaign?.code,
      ...(previousTransaction?.allocations.map((allocation) => allocation.campaign.code) ?? []),
      transaction.campaign?.code,
    ]);
    await warmPublicCampaignCaches(affectedCodes);

    return NextResponse.json(transaction);
  } catch (error) {
    return apiError(error);
  }
}
