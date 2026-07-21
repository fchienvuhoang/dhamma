import type { Metadata } from "next";
import {
  Clock3,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  LockKeyhole,
  Wallet,
} from "lucide-react";
import { cookies } from "next/headers";
import { ReadonlyLoginForm } from "@/components/readonly-login-form";
import { ReadonlyLogoutButton } from "@/components/readonly-logout-button";
import {
  READONLY_SESSION_COOKIE,
  isReadonlyViewConfigured,
  verifyReadonlySessionToken,
} from "@/lib/auth";
import { getReadonlyDashboardData } from "@/lib/readonly-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Báo cáo thiện pháp",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function ReadonlyReportPage() {
  const configured = isReadonlyViewConfigured();

  const cookieStore = await cookies();
  const authenticated = await verifyReadonlySessionToken(
    cookieStore.get(READONLY_SESSION_COOKIE)?.value,
  );

  if (!authenticated) {
    return <ReadonlyLoginScreen configured={configured} />;
  }

  const data = await getReadonlyDashboardData();
  return (
    <div className="min-h-screen bg-[#f7f7f4] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-700">
              <Eye className="h-4 w-4" />
              Chế độ chỉ xem
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">Báo cáo thiện pháp</h1>
          </div>
          <ReadonlyLogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryStat
            label="Tổng tiền trong tài khoản"
            value={money(data.bankAccount?.currentBalance ?? 0)}
            detail={data.bankAccount ? balanceDetail(data.bankAccount) : "Chưa có dữ liệu tài khoản"}
            icon={Landmark}
          />
          <SummaryStat
            label="Tổng thu các thiện pháp"
            value={money(data.totalCampaignIncome)}
            detail={`${data.campaigns.length.toLocaleString("vi-VN")} thiện pháp`}
            icon={Eye}
          />
          <SummaryStat
            label="Tổng chi các thiện pháp"
            value={money(data.totalCampaignExpenses)}
            detail={`${data.campaigns.length.toLocaleString("vi-VN")} thiện pháp`}
            icon={HandCoins}
            tone="amber"
          />
          <SummaryStat
            label="Còn thừa các thiện pháp"
            value={money(data.totalCampaignBalance)}
            detail="Tổng thu trừ tổng chi"
            icon={Wallet}
            tone="zinc"
          />
        </section>

        <section className="flex flex-col gap-3 border-y border-zinc-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 rounded-md bg-zinc-100 p-2 text-zinc-700">
              <Clock3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-600">Cập nhật sao kê gần nhất</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950 sm:text-2xl">
                {data.latestImport ? dateTime(data.latestImport.importedAt) : "Chưa có lần import nào"}
              </div>
            </div>
          </div>
          {data.latestImport ? (
            <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-500 sm:max-w-sm sm:justify-end">
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              <span className="break-all">{data.latestImport.fileName}</span>
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-4 sm:px-5">
            <h2 className="text-lg font-semibold">Danh sách thiện pháp</h2>
            <p className="mt-1 text-sm text-zinc-500">Số liệu tổng thu, tổng chi, còn thừa và đường dẫn công khai cho thí chủ.</p>
          </div>

          <div className="divide-y divide-zinc-100 md:hidden">
            {data.campaigns.map((campaign) => (
              <article key={campaign.id} className="px-4 py-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-semibold leading-6 text-zinc-950">
                      {campaign.name}
                    </h3>
                    <div className="mt-1 break-all text-xs text-zinc-500">{campaign.code}</div>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={campaign.status} />
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-zinc-100 py-3">
                  <div className="col-span-2 border-b border-zinc-100 pb-3">
                    <dt className="text-xs text-zinc-500">Lượt hùn phước</dt>
                    <dd className="mt-1 text-sm font-medium text-zinc-800">
                      {campaign.transactionCount.toLocaleString("vi-VN")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Tổng thu</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-emerald-700">
                      {money(campaign.income)}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-xs text-zinc-500">Tổng chi</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-amber-700">
                      {money(campaign.expenses)}
                    </dd>
                  </div>
                  <div className="col-span-2 border-t border-zinc-100 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-xs text-zinc-500">Còn thừa</dt>
                      <dd className="break-words text-sm font-semibold text-zinc-950">
                        {money(campaign.balance)}
                      </dd>
                    </div>
                  </div>
                </dl>

                <a
                  href={`/thien-phap/${campaign.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Thí chủ xem
                  <ExternalLink className="h-4 w-4" />
                </a>
              </article>
            ))}
            {data.campaigns.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-zinc-500">Chưa có thiện pháp nào.</div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Thiện pháp</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Lượt hùn phước</th>
                  <th className="px-4 py-3 text-right">Tổng thu</th>
                  <th className="px-4 py-3 text-right">Tổng chi</th>
                  <th className="px-4 py-3 text-right">Còn thừa</th>
                  <th className="px-4 py-3 text-right">Link công khai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-zinc-50">
                    <td className="max-w-md px-4 py-3">
                      <div className="break-words font-medium leading-5 text-zinc-950">{campaign.name}</div>
                      <div className="mt-0.5 break-all text-xs text-zinc-500">{campaign.code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-zinc-600">
                      {campaign.transactionCount.toLocaleString("vi-VN")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">
                      {money(campaign.income)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-amber-700">
                      {money(campaign.expenses)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-zinc-950">
                      {money(campaign.balance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/thien-phap/${campaign.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Thí chủ xem
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                ))}
                {data.campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                      Chưa có thiện pháp nào.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function ReadonlyLoginScreen({ configured }: { configured: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f4] px-4 py-8 text-zinc-950">
      <section className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-zinc-100 p-2 text-zinc-700">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Xem báo cáo thiện pháp</h1>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Nhập mật khẩu để mở trang báo cáo chỉ xem.
            </p>
          </div>
        </div>
        <ReadonlyLoginForm configured={configured} />
      </section>
    </main>
  );
}

function SummaryStat({
  label,
  value,
  detail,
  icon: Icon,
  tone = "emerald",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Landmark;
  tone?: "emerald" | "amber" | "zinc";
}) {
  const iconClassName =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "zinc"
        ? "bg-zinc-100 text-zinc-700"
        : "bg-emerald-50 text-emerald-700";

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-zinc-950">{value}</div>
          <div className="mt-1 text-xs text-zinc-500">{detail}</div>
        </div>
        <span className={`rounded-md p-2 ${iconClassName}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "ACTIVE" | "PAUSED" | "COMPLETED" }) {
  const labels = { ACTIVE: "Đang chạy", PAUSED: "Tạm dừng", COMPLETED: "Hoàn tất" };
  const classes = {
    ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
    PAUSED: "border-amber-200 bg-amber-50 text-amber-700",
    COMPLETED: "border-zinc-200 bg-zinc-50 text-zinc-600",
  };
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}

function balanceDetail(account: NonNullable<Awaited<ReturnType<typeof getReadonlyDashboardData>>["bankAccount"]>) {
  const parts = [account.bankName, account.accountName].filter(Boolean);
  if (account.balanceAsOf) {
    parts.push(`cập nhật ${new Intl.DateTimeFormat("vi-VN").format(new Date(account.balanceAsOf))}`);
  }
  return parts.join(" · ");
}

function money(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
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
