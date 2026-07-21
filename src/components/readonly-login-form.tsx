"use client";

import { Loader2, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";

export function ReadonlyLoginForm({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    configured ? null : "READONLY_VIEW_PASSWORD chưa được cấu hình.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/viewer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { ok?: boolean; next?: string; error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Không đăng nhập được.");
      }
      window.location.assign(result.next || "/bao-cao");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không đăng nhập được.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Mật khẩu xem báo cáo</span>
        <input
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          required
          disabled={!configured || isSubmitting}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-zinc-50"
        />
      </label>
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      <button
        disabled={!configured || isSubmitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        Xem báo cáo
      </button>
    </form>
  );
}
