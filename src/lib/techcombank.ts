import * as XLSX from "xlsx";
import { parseAmount } from "@/lib/money";
import { normalizeTransferText } from "@/lib/text";

type SheetCell = string | number | boolean | Date | null | undefined;

export type StatementMeta = {
  sourceBank: "TECHCOMBANK";
  accountNumber: string | null;
  accountName: string | null;
  currency: string;
  fromDate: Date | null;
  toDate: Date | null;
  openingBalance: number | null;
  closingBalance: number | null;
};

export type StatementTransactionRow = {
  transactionDate: Date;
  statementRow: number;
  description: string;
  detail: string;
  debitAmount: number;
  creditAmount: number;
  balanceAfter: number | null;
  raw: Record<string, unknown>;
};

export type ParsedStatement = {
  sheetName: string;
  meta: StatementMeta;
  rows: StatementTransactionRow[];
};

const REQUIRED_HEADERS = ["ngay", "dien giai", "chi tiet"];

export function parseTechcombankStatement(buffer: Buffer): ParsedStatement {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: false,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("File Excel không có sheet nào.");
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<SheetCell[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: false,
  });

  const headerIndex = findHeaderRow(matrix);
  const headerRow = matrix[headerIndex].map(normalizeHeader);
  const columns = {
    date: headerRow.indexOf("ngay"),
    description: headerRow.indexOf("dien giai"),
    detail: headerRow.indexOf("chi tiet"),
    debit: headerRow.indexOf("no"),
    credit: headerRow.indexOf("co"),
    balance: headerRow.indexOf("so du"),
  };

  const rows: StatementTransactionRow[] = matrix
    .slice(headerIndex + 1)
    .map((row, offset): StatementTransactionRow | null => {
      const transactionDate = parseBankDate(row[columns.date]);
      const description = toCellString(row[columns.description]);
      const detail = toCellString(row[columns.detail]);

      if (!transactionDate || !description || !detail) {
        return null;
      }

      return {
        transactionDate,
        statementRow: headerIndex + offset + 2,
        description,
        detail,
        debitAmount: parseAmount(row[columns.debit]),
        creditAmount: parseAmount(row[columns.credit]),
        balanceAfter: row[columns.balance] == null ? null : parseAmount(row[columns.balance]),
        raw: {
          NGAY: row[columns.date] ?? null,
          DIEN_GIAI: row[columns.description] ?? null,
          CHI_TIET: row[columns.detail] ?? null,
          NO: row[columns.debit] ?? null,
          CO: row[columns.credit] ?? null,
          SO_DU: row[columns.balance] ?? null,
        } as Record<string, unknown>,
      };
    })
    .filter((row): row is StatementTransactionRow => row !== null);

  return {
    sheetName,
    meta: parseMeta(matrix.slice(0, headerIndex)),
    rows,
  };
}

function findHeaderRow(matrix: SheetCell[][]) {
  const index = matrix.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return REQUIRED_HEADERS.every((header) => normalized.includes(header));
  });

  if (index < 0) {
    throw new Error("Không tìm thấy dòng header giao dịch Techcombank.");
  }

  return index;
}

function parseMeta(rows: SheetCell[][]): StatementMeta {
  return {
    sourceBank: "TECHCOMBANK",
    accountNumber: findValueAfterLabel(rows, "so tai khoan"),
    accountName: findValueAfterLabel(rows, "ten tai khoan"),
    currency: findValueAfterLabel(rows, "loai tien") ?? "VND",
    fromDate: parseBankDate(findValueAfterLabel(rows, "tu ngay")),
    toDate: parseBankDate(findValueAfterLabel(rows, "toi ngay")),
    openingBalance: parseOptionalAmount(findValueAfterLabel(rows, "so du dau ky")),
    closingBalance: parseOptionalAmount(findValueAfterLabel(rows, "so du cuoi ky")),
  };
}

function findValueAfterLabel(rows: SheetCell[][], label: string) {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      if (normalizeHeader(row[index]) === label) {
        const value = row.slice(index + 1).find((cell) => toCellString(cell));
        return value == null ? null : toCellString(value);
      }
    }
  }

  return null;
}

function parseOptionalAmount(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  return parseAmount(value);
}

function parseBankDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const hour = parsed.H || parsed.M || parsed.S ? parsed.H : 12;
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, hour, parsed.M, parsed.S));
    }
  }

  const raw = toCellString(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!match) {
    return null;
  }

  const [, day, month, year, hour, minute = "0", second = "0"] = match;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour == null ? 12 : Number(hour),
    Number(minute),
    Number(second),
  ));
}

function normalizeHeader(value: unknown) {
  return normalizeTransferText(value);
}

function toCellString(value: unknown) {
  return String(value ?? "").trim();
}
