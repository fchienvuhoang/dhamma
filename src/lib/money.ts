import { Prisma } from "@prisma/client";

type DecimalValue = Prisma.Decimal | number | string | null | undefined;

export function decimalToNumber(value: DecimalValue) {
  if (value == null) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  return Number(value.toString());
}

export function parseAmount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return 0;
  }

  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toPrismaDecimal(value: number) {
  return new Prisma.Decimal(value || 0);
}
