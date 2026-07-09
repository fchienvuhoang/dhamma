"use client";

import {
  AlertCircle,
  ArrowUpFromLine,
  Banknote,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Tags,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type React from "react";
import type {
  CampaignSummary,
  DashboardData,
  DashboardState,
  TransactionSummary,
} from "@/lib/dashboard";
import { normalizeTransferText, splitKeywords } from "@/lib/text";

type Props = {
  state: DashboardState;
};

type ImportResponse = {
  fileName: string;
  totalRows: number;
  insertedRows: number;
  duplicateRows: number;
  unmatchedRows: number;
  accountNumber: string | null;
  closingBalance: number | null;
};

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

export function DashboardShell({ state }: Props) {
  if (!state.ok) {
    return <SetupScreen state={state} />;
  }

  return <Dashboard data={state.data} />;
}

function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<"overview" | "transactions">("overview");
  const [activeTab, setActiveTab] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = normalizeTransferText(query);

    return data.transactions.filter((transaction) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "unmatched" && !transaction.campaign) ||
        transaction.campaign?.id === activeTab;

      if (!matchesTab) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return normalizeTransferText(
        `${transaction.description} ${transaction.detail} ${transaction.campaign?.name ?? ""}`,
      ).includes(normalizedQuery);
    });
  }, [activeTab, data.transactions, query]);

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setImportResult(null);
    setIsImporting(true);

    try {
      const form = event.currentTarget;
      const response = await fetch("/api/import", {
        method: "POST",
        body: new FormData(form),
      });
      const json = await readJson<ImportResponse>(response);
      setImportResult(json);
      setMessage(`Đã import ${json.insertedRows}/${json.totalRows} giao dịch mới.`);
      form.reset();
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCampaignCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingCampaign(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const payload = campaignPayloadFromForm(formData);
      await readJson(
        await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setMessage(`Đã tạo thiện pháp ${payload.code}.`);
      form.reset();
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSavingCampaign(false);
    }
  }

  async function handleCampaignUpdate(event: FormEvent<HTMLFormElement>, campaignId: string) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingCampaign(true);

    try {
      const formData = new FormData(event.currentTarget);
      const payload = campaignPayloadFromForm(formData);
      await readJson(
        await fetch(`/api/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setMessage(`Đã cập nhật thiện pháp ${payload.code}.`);
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSavingCampaign(false);
    }
  }

  async function handleCampaignDelete(campaign: CampaignSummary) {
    if (campaign.transactionCount > 0 || campaign.expenseCount > 0) {
      setError("Chỉ có thể xóa thiện pháp chưa có giao dịch và chưa có khoản chi.");
      setMessage(null);
      return;
    }

    const confirmed = window.confirm(`Xóa thiện pháp "${campaign.code}"? Hành động này sẽ xóa cả bộ từ khóa.`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);
    setDeletingCampaignId(campaign.id);

    try {
      await readJson(
        await fetch(`/api/campaigns/${campaign.id}`, {
          method: "DELETE",
        }),
      );
      setMessage(`Đã xóa thiện pháp ${campaign.code}.`);
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setDeletingCampaignId(null);
    }
  }

  async function handleExpenseCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingExpense(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      await readJson(
        await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formData.get("title"),
            amount: formData.get("amount"),
            spentAt: formData.get("spentAt"),
            campaignId: formData.get("campaignId") || null,
            payee: formData.get("payee") || null,
            note: formData.get("note") || null,
          }),
        }),
      );
      setMessage("Đã ghi nhận khoản chi.");
      form.reset();
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSavingExpense(false);
    }
  }

  async function handleReclassify() {
    setError(null);
    setMessage(null);
    setIsReclassifying(true);

    try {
      const result = await readJson<{ totalRows: number; matchedRows: number; unmatchedRows: number }>(
        await fetch("/api/reclassify", { method: "POST" }),
      );
      setMessage(
        `Đã phân loại lại ${result.totalRows} giao dịch: ${result.matchedRows} khớp, ${result.unmatchedRows} chưa khớp.`,
      );
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsReclassifying(false);
    }
  }

  async function assignTransaction(transactionId: string, campaignId: string | null) {
    setError(null);
    setMessage(null);
    setPendingTransactionId(transactionId);

    try {
      await readJson(
        await fetch(`/api/transactions/${transactionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId }),
        }),
      );
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setPendingTransactionId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f4] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Techcombank statement classifier
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">
              Quản lý thiện pháp và sao kê
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <HeaderStat label="Giao dịch" value={data.overview.transactionCount.toLocaleString("vi-VN")} />
            <HeaderStat label="Chưa phân loại" value={data.overview.unmatchedCount.toLocaleString("vi-VN")} />
            <HeaderStat
              label="TK ngân hàng"
              value={money(data.overview.bankBalance)}
              tone="emerald"
            />
            <HeaderStat
              label="Quỹ theo thiện pháp"
              value={money(data.overview.trackedFundBalance)}
              tone="amber"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-5">
          <Panel>
            <PanelTitle icon={Upload} title="Import sao kê" />
            <form className="mt-4 space-y-3" onSubmit={handleImport}>
              <input
                name="file"
                type="file"
                accept=".xlsx,.xls"
                required
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
              />
              <button
                disabled={isImporting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Import Excel
              </button>
            </form>
            {importResult ? (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {importResult.fileName}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2">
                  <StatLine label="Mới" value={importResult.insertedRows} />
                  <StatLine label="Trùng" value={importResult.duplicateRows} />
                  <StatLine label="Tổng dòng" value={importResult.totalRows} />
                  <StatLine label="Chưa khớp" value={importResult.unmatchedRows} />
                </dl>
              </div>
            ) : null}
            {data.latestImport ? (
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                Lần import gần nhất: {data.latestImport.fileName}, {dateTime(data.latestImport.importedAt)}
              </p>
            ) : null}
          </Panel>

          <Panel>
            <PanelTitle icon={Plus} title="Thêm thiện pháp" />
            <form className="mt-4 space-y-3" onSubmit={handleCampaignCreate}>
              <Input name="code" label="Mã" placeholder="cntt10" required />
              <Input name="name" label="Tên thiện pháp" placeholder="Cúng dường y áo..." required />
              <Select name="status" label="Trạng thái" defaultValue="ACTIVE">
                <option value="ACTIVE">Đang chạy</option>
                <option value="PAUSED">Tạm dừng</option>
                <option value="COMPLETED">Hoàn tất</option>
              </Select>
              <Textarea
                name="keywords"
                label="Từ khóa"
                placeholder={"cntt10\nchùa tam tạng 10\ncung duong y ao"}
              />
              <Textarea name="description" label="Ghi chú" rows={2} />
              <button
                disabled={isSavingCampaign}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
                Lưu thiện pháp
              </button>
            </form>
          </Panel>

          <Panel>
            <PanelTitle icon={ArrowUpFromLine} title="Ghi nhận khoản chi" />
            <form className="mt-4 space-y-3" onSubmit={handleExpenseCreate}>
              <Input name="title" label="Nội dung chi" placeholder="Mua y áo / chuyển khoản..." required />
              <Input name="amount" label="Số tiền" inputMode="numeric" placeholder="1000000" required />
              <Input name="spentAt" label="Ngày chi" type="date" defaultValue={todayInput()} required />
              <Select name="campaignId" label="Thiện pháp">
                <option value="">Chi chung</option>
                {data.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.code} - {campaign.name}
                  </option>
                ))}
              </Select>
              <Input name="payee" label="Người nhận" />
              <Textarea name="note" label="Ghi chú" rows={2} />
              <button
                disabled={isSavingExpense}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                Lưu khoản chi
              </button>
            </form>
          </Panel>
        </aside>

        <section className="space-y-5">
          <StatusMessages message={message} error={error} />

          <div className="flex gap-2 rounded-md border border-zinc-200 bg-white p-1">
            <MainTabButton active={mainTab === "overview"} onClick={() => setMainTab("overview")}>
              Tổng quan thiện pháp
            </MainTabButton>
            <MainTabButton active={mainTab === "transactions"} onClick={() => setMainTab("transactions")}>
              Giao dịch sao kê
            </MainTabButton>
          </div>

          {mainTab === "overview" ? (
            <>
              <Panel>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <PanelTitle icon={Settings} title="Danh sách thiện pháp" />
                  <button
                    onClick={handleReclassify}
                    disabled={isReclassifying}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isReclassifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Phân loại lại
                  </button>
                </div>
                <CampaignTable
                  campaigns={data.campaigns}
                  isSaving={isSavingCampaign}
                  deletingCampaignId={deletingCampaignId}
                  onUpdate={handleCampaignUpdate}
                  onDelete={handleCampaignDelete}
                />
              </Panel>

              <Panel>
                <PanelTitle icon={Wallet} title="Tổng hợp thu chi" />
                <FundSummaryTable data={data} />
              </Panel>
            </>
          ) : (
            <Panel>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <PanelTitle icon={FileSpreadsheet} title="Giao dịch sao kê" />
                <div className="relative w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm nội dung, mã giao dịch..."
                    className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
                  Tất cả
                </TabButton>
                <TabButton active={activeTab === "unmatched"} onClick={() => setActiveTab("unmatched")}>
                  Chưa phân loại
                </TabButton>
                {data.campaigns.map((campaign) => (
                  <TabButton
                    key={campaign.id}
                    active={activeTab === campaign.id}
                    onClick={() => setActiveTab(campaign.id)}
                  >
                    {campaign.code}
                  </TabButton>
                ))}
              </div>

              <TransactionTable
                transactions={filteredTransactions}
                campaigns={data.campaigns}
                pendingTransactionId={pendingTransactionId}
                onAssign={assignTransaction}
              />
            </Panel>
          )}

        </section>
      </main>
    </div>
  );
}

function TransactionTable({
  transactions,
  campaigns,
  pendingTransactionId,
  onAssign,
}: {
  transactions: TransactionSummary[];
  campaigns: CampaignSummary[];
  pendingTransactionId: string | null;
  onAssign: (transactionId: string, campaignId: string | null) => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2">Diễn giải</th>
              <th className="px-3 py-2">Chi tiết</th>
              <th className="px-3 py-2 text-right">Có</th>
              <th className="px-3 py-2 text-right">Nợ</th>
              <th className="px-3 py-2">Thiện pháp</th>
              <th className="px-3 py-2">Gán</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {transactions.map((transaction) => (
              <tr
                key={transaction.id}
                className={transaction.campaign ? "hover:bg-zinc-50" : "bg-rose-50/50 hover:bg-rose-50"}
              >
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{dateOnly(transaction.transactionDate)}</td>
                <td className="max-w-md px-3 py-2">
                  <div className="line-clamp-2 font-medium text-zinc-900">{transaction.description}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {transaction.matchedKeyword ?? "Chưa có keyword khớp"}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-600">
                  {transaction.detail}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-emerald-700">
                  {transaction.creditAmount > 0 ? money(transaction.creditAmount) : "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-amber-700">
                  {transaction.debitAmount > 0 ? money(transaction.debitAmount) : "-"}
                </td>
                <td className="px-3 py-2">
                  {transaction.campaign ? (
                    <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      {transaction.campaign.code}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                      Chưa phân loại
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={transaction.campaign?.id ?? ""}
                    disabled={pendingTransactionId === transaction.id}
                    onChange={(event) => onAssign(transaction.id, event.target.value || null)}
                    className="w-44 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="">Chưa phân loại</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.code}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-zinc-500">
                  Không có giao dịch phù hợp.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignTable({
  campaigns,
  isSaving,
  deletingCampaignId,
  onUpdate,
  onDelete,
}: {
  campaigns: CampaignSummary[];
  isSaving: boolean;
  deletingCampaignId: string | null;
  onUpdate: (event: FormEvent<HTMLFormElement>, campaignId: string) => void;
  onDelete: (campaign: CampaignSummary) => void;
}) {
  return (
    <>
      <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Mã</th>
                <th className="px-3 py-2">Thiện pháp</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Từ khóa</th>
                <th className="px-3 py-2 text-right">Tổng thu</th>
                <th className="px-3 py-2 text-right">Tổng chi</th>
                <th className="px-3 py-2 text-right">Còn lại</th>
                <th className="px-3 py-2 text-right">GD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="rounded-md bg-zinc-950 px-2 py-1 font-mono text-xs font-medium text-white">
                      {campaign.code}
                    </span>
                  </td>
                  <td className="max-w-xs px-3 py-2">
                    <div className="font-medium text-zinc-900">{campaign.name}</div>
                    {campaign.description ? (
                      <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{campaign.description}</div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClassNames[campaign.status]}`}>
                      {statusLabels[campaign.status]}
                    </span>
                  </td>
                  <td className="max-w-xs px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {campaign.keywords.slice(0, 4).map((keyword) => (
                        <span key={keyword.id} className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                          {keyword.keyword}
                        </span>
                      ))}
                      {campaign.keywords.length > 4 ? (
                        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-500">
                          +{campaign.keywords.length - 4}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-emerald-700">
                    {money(campaign.income)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-amber-700">
                    {money(campaign.expenses)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-zinc-950">
                    {money(campaign.balance)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-600">
                    {campaign.transactionCount.toLocaleString("vi-VN")}
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                    Chưa có thiện pháp nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <details className="group mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-zinc-800">
          Sửa từ khóa, trạng thái hoặc xóa thiện pháp
          <span className="text-xs text-zinc-500 group-open:hidden">Mở</span>
          <span className="hidden text-xs text-zinc-500 group-open:inline">Thu gọn</span>
        </summary>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {campaigns.map((campaign) => (
            <CampaignPanel
              key={campaign.id}
              campaign={campaign}
              isSaving={isSaving}
              isDeleting={deletingCampaignId === campaign.id}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      </details>
    </>
  );
}

function FundSummaryTable({ data }: { data: DashboardData }) {
  const totalCampaignIncome = data.campaigns.reduce((sum, campaign) => sum + campaign.income, 0);
  const totalExpenses = data.overview.totalExpenses;
  const currentAmount = totalCampaignIncome - totalExpenses;
  const bankDifference = data.overview.bankBalance - currentAmount;

  const rows = [
    {
      label: "Tổng thu các thiện pháp",
      value: totalCampaignIncome,
      note: "Cộng tổng thu của toàn bộ thiện pháp trong bảng 1.",
      className: "text-emerald-700",
    },
    {
      label: "Tổng chi đã ghi nhận",
      value: totalExpenses,
      note: "Cộng tất cả bản ghi chi tiền ra.",
      className: "text-amber-700",
    },
    {
      label: "Số tiền hiện tại",
      value: currentAmount,
      note: "Tổng thu các thiện pháp trừ tổng chi.",
      className: "text-zinc-950",
    },
    {
      label: "Số dư tài khoản ngân hàng",
      value: data.overview.bankBalance,
      note: data.bankAccount
        ? `${data.bankAccount.bankName} ${data.bankAccount.accountNumber}`
        : "Chưa có thông tin tài khoản từ sao kê.",
      className: "text-zinc-950",
    },
    {
      label: "Chênh lệch tài khoản và sổ theo dõi",
      value: bankDifference,
      note: "Số dư ngân hàng trừ số tiền hiện tại theo thu chi.",
      className: bankDifference === 0 ? "text-zinc-700" : "text-rose-700",
    },
    {
      label: "Thu chưa phân loại",
      value: data.overview.unmatchedIncome,
      note: "Khoản thu chưa nằm trong tổng thu thiện pháp.",
      className: "text-rose-700",
    },
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">Khoản mục</th>
            <th className="px-3 py-2">Cách tính / ghi chú</th>
            <th className="px-3 py-2 text-right">Số tiền</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-3 py-2 font-medium text-zinc-900">{row.label}</td>
              <td className="px-3 py-2 text-zinc-500">{row.note}</td>
              <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${row.className}`}>
                {money(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignPanel({
  campaign,
  isSaving,
  isDeleting,
  onUpdate,
  onDelete,
}: {
  campaign: CampaignSummary;
  isSaving: boolean;
  isDeleting: boolean;
  onUpdate: (event: FormEvent<HTMLFormElement>, campaignId: string) => void;
  onDelete: (campaign: CampaignSummary) => void;
}) {
  const canDelete = campaign.transactionCount === 0 && campaign.expenseCount === 0;

  return (
    <details className="rounded-md border border-zinc-200 bg-white p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-zinc-950 px-2 py-1 font-mono text-xs font-medium text-white">
                {campaign.code}
              </span>
              <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClassNames[campaign.status]}`}>
                {statusLabels[campaign.status]}
              </span>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-zinc-950">{campaign.name}</h3>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-emerald-700">{money(campaign.income)}</div>
            <div className="text-xs text-zinc-500">thu</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <MiniStat label="Chi" value={money(campaign.expenses)} />
          <MiniStat label="Tồn" value={money(campaign.balance)} />
          <MiniStat label="GD" value={campaign.transactionCount.toLocaleString("vi-VN")} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {campaign.keywords.slice(0, 8).map((keyword) => (
            <span key={keyword.id} className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
              {keyword.keyword}
            </span>
          ))}
        </div>
      </summary>
      <form className="mt-4 space-y-3 border-t border-zinc-100 pt-4" onSubmit={(event) => onUpdate(event, campaign.id)}>
        <Input name="code" label="Mã" defaultValue={campaign.code} required />
        <Input name="name" label="Tên thiện pháp" defaultValue={campaign.name} required />
        <Select name="status" label="Trạng thái" defaultValue={campaign.status}>
          <option value="ACTIVE">Đang chạy</option>
          <option value="PAUSED">Tạm dừng</option>
          <option value="COMPLETED">Hoàn tất</option>
        </Select>
        <Textarea
          name="keywords"
          label="Từ khóa"
          rows={4}
          defaultValue={campaign.keywords.map((keyword) => keyword.keyword).join("\n")}
        />
        <Textarea name="description" label="Ghi chú" rows={2} defaultValue={campaign.description ?? ""} />
        <button
          disabled={isSaving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
          Cập nhật
        </button>
      </form>
      <div className="mt-3 border-t border-zinc-100 pt-3">
        <button
          type="button"
          disabled={!canDelete || isDeleting}
          onClick={() => onDelete(campaign)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400"
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Xóa thiện pháp
        </button>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          {canDelete
            ? "Có thể xóa vì thiện pháp này chưa có giao dịch hoặc khoản chi."
            : "Không thể xóa khi đã có giao dịch hoặc khoản chi."}
        </p>
      </div>
    </details>
  );
}

function SetupScreen({ state }: { state: Exclude<DashboardState, { ok: true }> }) {
  return (
    <div className="min-h-screen bg-[#f7f7f4] px-4 py-8 text-zinc-950">
      <div className="mx-auto max-w-3xl rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-1 h-5 w-5 text-amber-600" />
          <div>
            <h1 className="text-xl font-semibold">Cần cấu hình PostgreSQL</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{state.message}</p>
          </div>
        </div>
        <div className="mt-5 space-y-3 text-sm">
          <pre className="overflow-x-auto rounded-md bg-zinc-950 p-4 text-zinc-50">
            <code>{'DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"'}</code>
          </pre>
          <pre className="overflow-x-auto rounded-md bg-zinc-100 p-4 text-zinc-800">
            <code>{"pnpm db:generate\npnpm db:push\npnpm db:seed\npnpm dev"}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, tone = "zinc" }: { label: string; value: string; tone?: "zinc" | "emerald" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-zinc-950";
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">{children}</div>;
}

function PanelTitle({ icon: Icon, title }: { icon: typeof Upload; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-md bg-zinc-100 p-2 text-zinc-700">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium ${
        active
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {children}
    </button>
  );
}

function MainTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
      }`}
    >
      {children}
    </button>
  );
}

function Input({
  label,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        {...props}
        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 ${className}`}
      />
    </label>
  );
}

function Textarea({
  label,
  className = "",
  rows = 3,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <textarea
        rows={rows}
        {...props}
        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 ${className}`}
      />
    </label>
  );
}

function Select({
  label,
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <select
        {...props}
        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 ${className}`}
      >
        {children}
      </select>
    </label>
  );
}

function StatusMessages({ message, error }: { message: string | null; error: string | null }) {
  if (!message && !error) {
    return null;
  }

  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <div className="flex items-start gap-2">
        {error ? <AlertCircle className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4" />}
        <span>{error ?? message}</span>
      </div>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-emerald-700/70">{label}</dt>
      <dd className="font-semibold">{value.toLocaleString("vi-VN")}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-50 p-2">
      <div className="text-zinc-500">{label}</div>
      <div className="mt-1 font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function campaignPayloadFromForm(formData: FormData) {
  return {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    status: String(formData.get("status") ?? "ACTIVE"),
    keywords: splitKeywords(String(formData.get("keywords") ?? "")),
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "Request failed.");
  }

  return json as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Có lỗi không xác định.";
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

function dateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}
