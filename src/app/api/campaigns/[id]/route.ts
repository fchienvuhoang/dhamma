import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { makeCampaignCode, normalizeTransferText } from "@/lib/text";

const updateCampaignSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]),
  keywords: z.array(z.string().min(1)).default([]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = updateCampaignSchema.parse(await request.json());
    const prisma = getPrisma();
    const code = makeCampaignCode(body.code);
    const keywords = uniqueKeywords([body.code, ...body.keywords]);

    const campaign = await prisma.$transaction(async (tx) => {
      await tx.campaignKeyword.deleteMany({
        where: { campaignId: id },
      });

      return tx.campaign.update({
        where: { id },
        data: {
          code,
          name: body.name.trim(),
          description: body.description?.trim() || null,
          status: body.status,
          keywords: {
            createMany: {
              data: keywords.map((keyword) => ({
                keyword,
                normalizedKeyword: normalizeTransferText(keyword),
              })),
              skipDuplicates: true,
            },
          },
        },
        include: {
          keywords: true,
        },
      });
    });

    return NextResponse.json(campaign);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const prisma = getPrisma();

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            transactions: true,
            expenses: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Không tìm thấy thiện pháp." }, { status: 404 });
    }

    if (campaign._count.transactions > 0 || campaign._count.expenses > 0) {
      return NextResponse.json(
        {
          error: "Chỉ có thể xóa thiện pháp chưa có giao dịch và chưa có khoản chi.",
        },
        { status: 409 },
      );
    }

    await prisma.campaign.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

function uniqueKeywords(keywords: string[]) {
  const seen = new Set<string>();
  return keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => {
      const normalized = normalizeTransferText(keyword);
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
}
