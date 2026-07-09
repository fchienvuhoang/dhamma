"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { PublicCampaignData, PublicCampaignTransaction } from "@/lib/public-campaign";
import { normalizeTransferText } from "@/lib/text";

const statusLabels = {
  ACTIVE: "Đang chạy",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn tất",
};

const statusClassNames = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PAUSED: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETED: "border-zinc-200 bg-zinc-50 text-zinc-600",
};

export function PublicCampaignView({ data }: { data: PublicCampaignData }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeTransferText(query);

  const filteredTransactions = useMemo(() => {
    if (!normalizedQuery) {
      return data.transactions;
    }

    return data.transactions.filter((transaction) => {
      return normalizeTransferText(transaction.description).includes(normalizedQuery);
    });
  }, [data.transactions, normalizedQuery]);

  return (
    <div className="min-h-screen bg-[#f7f7f4] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-zinc-950 px-2 py-1 font-mono text-xs font-medium text-white">
              {data.code}
            </span>
            <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClassNames[data.status]}`}>
              {statusLabels[data.status]}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal text-zinc-950 sm:text-3xl">
            {data.name}
          </h1>
          {data.description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{data.description}</p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PublicStat label="Hùn phước" value={money(data.income)} tone="emerald" />
            <PublicStat label="Đã cúng dường" value={money(data.expenses)} tone="amber" />
            <PublicStat label="Tịnh tài còn lại" value={money(data.balance)} />
            <PublicStat label="Lượt hùn phước" value={data.transactionCount.toLocaleString("vi-VN")} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6">
        <section className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Danh sách giao dịch</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {filteredTransactions.length.toLocaleString("vi-VN")} / {data.transactions.length.toLocaleString("vi-VN")} giao dịch
              </p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo tên hoặc nội dung"
                className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2 md:hidden">
            {filteredTransactions.map((transaction) => (
              <PublicTransactionCard key={transaction.id} transaction={transaction} />
            ))}
            {filteredTransactions.length === 0 ? <EmptyState /> : null}
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-md border border-zinc-200 md:block">
            <div className="max-h-[680px] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Ngày</th>
                    <th className="px-3 py-2">Diễn giải</th>
                    <th className="px-3 py-2">Loại</th>
                    <th className="px-3 py-2 text-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {filteredTransactions.map((transaction) => (
                    <PublicTransactionRow key={transaction.id} transaction={transaction} />
                  ))}
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function PublicTransactionCard({ transaction }: { transaction: PublicCampaignTransaction }) {
  const meta = transactionMeta(transaction);

  return (
    <article className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-500">{dateOnly(transaction.transactionDate)}</div>
          <div className={`mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-medium ${meta.className}`}>
            {meta.label}
          </div>
        </div>
        <div className={`whitespace-nowrap text-right text-sm font-semibold ${meta.amountClassName}`}>
          {money(meta.amount)}
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800">
        {transaction.description}
      </p>
    </article>
  );
}

function PublicTransactionRow({ transaction }: { transaction: PublicCampaignTransaction }) {
  const meta = transactionMeta(transaction);

  return (
    <tr className="hover:bg-zinc-50">
      <td className="whitespace-nowrap px-3 py-2 align-top text-zinc-600">{dateOnly(transaction.transactionDate)}</td>
      <td className="max-w-2xl px-3 py-2 align-top">
        <div className="whitespace-pre-wrap break-words font-medium text-zinc-900">{transaction.description}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 align-top">
        <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${meta.className}`}>
          {meta.label}
        </span>
      </td>
      <td className={`whitespace-nowrap px-3 py-2 text-right align-top font-semibold ${meta.amountClassName}`}>
        {money(meta.amount)}
      </td>
    </tr>
  );
}

function EmptyState() {
  return <div className="px-3 py-10 text-center text-sm text-zinc-500">Không có giao dịch phù hợp.</div>;
}

function PublicStat({ label, value, tone = "zinc" }: { label: string; value: string; tone?: "zinc" | "emerald" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-zinc-950";

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function transactionMeta(transaction: PublicCampaignTransaction) {
  if (transaction.creditAmount > 0) {
    return {
      label: "Hùn phước",
      amount: transaction.creditAmount,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      amountClassName: "text-emerald-700",
    };
  }

  return {
    label: "Chi",
    amount: transaction.debitAmount,
    className: "border-amber-200 bg-amber-50 text-amber-700",
    amountClassName: "text-amber-700",
  };
}

function money(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function dateOnly(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
