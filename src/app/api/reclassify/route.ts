import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { reclassifyImportedTransactions } from "@/lib/importer";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await reclassifyImportedTransactions();
    const affectedCodes = invalidatePublicCampaignCache(result.affectedCampaignCodes);
    await warmPublicCampaignCaches(affectedCodes);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
