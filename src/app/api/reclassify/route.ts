import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { reclassifyImportedTransactions } from "@/lib/importer";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await reclassifyImportedTransactions();
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
