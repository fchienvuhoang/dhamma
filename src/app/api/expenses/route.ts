import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { parseAmount } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";

const expenseSchema = z.object({
  title: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  spentAt: z.string().min(1),
  campaignId: z.string().optional().nullable(),
  payee: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const prisma = getPrisma();
    const expenses = await prisma.expense.findMany({
      include: {
        campaign: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    return NextResponse.json(expenses);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = expenseSchema.parse(await request.json());
    const prisma = getPrisma();
    const amount = parseAmount(body.amount);

    if (amount <= 0) {
      return NextResponse.json({ error: "Số tiền chi phải lớn hơn 0." }, { status: 400 });
    }

    const expense = await prisma.expense.create({
      data: {
        title: body.title.trim(),
        amount,
        spentAt: new Date(body.spentAt),
        campaignId: body.campaignId || null,
        payee: body.payee?.trim() || null,
        note: body.note?.trim() || null,
      },
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
