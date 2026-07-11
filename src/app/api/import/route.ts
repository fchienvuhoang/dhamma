import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { importTechcombankStatement } from "@/lib/importer";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Vui lòng chọn file Excel sao kê." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importTechcombankStatement(file.name, buffer);
    const affectedCodes = invalidatePublicCampaignCache(result.affectedCampaignCodes);
    await warmPublicCampaignCaches(affectedCodes);

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
