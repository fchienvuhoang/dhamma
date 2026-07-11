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
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = updateTransactionSchema.parse(await request.json());
    const prisma = getPrisma();

    const previousTransaction = await prisma.bankTransaction.findUnique({
      where: { id },
      select: { campaign: { select: { code: true } } },
    });
    const transaction = await prisma.bankTransaction.update({
      where: { id },
      data: {
        campaignId: body.campaignId || null,
        matchedKeyword: body.campaignId ? "Gán thủ công" : null,
        classificationStatus: body.campaignId ? "MANUAL" : "UNMATCHED",
      },
      include: { campaign: { select: { code: true } } },
    });

    const affectedCodes = invalidatePublicCampaignCache([
      previousTransaction?.campaign?.code,
      transaction.campaign?.code,
    ]);
    await warmPublicCampaignCaches(affectedCodes);

    return NextResponse.json(transaction);
  } catch (error) {
    return apiError(error);
  }
}
