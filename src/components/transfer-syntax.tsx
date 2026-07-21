"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function TransferSyntax({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    let didCopy = false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(code);
        didCopy = true;
      } catch {
        didCopy = false;
      }
    }

    if (!didCopy) {
      const input = document.createElement("textarea");
      input.value = code;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      didCopy = document.execCommand("copy");
      input.remove();
    }

    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-zinc-500">Cú pháp chuyển khoản</div>
      <div className="mt-1 flex min-h-10 min-w-0 items-stretch overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
        <code className="flex min-w-0 flex-1 items-center break-all px-3 py-2 font-mono text-sm font-semibold text-zinc-900">
          {code}
        </code>
        <button
          type="button"
          onClick={copyCode}
          aria-label={copied ? "Đã sao chép cú pháp" : "Sao chép cú pháp chuyển khoản"}
          title={copied ? "Đã sao chép" : "Sao chép"}
          className={`inline-flex w-10 shrink-0 items-center justify-center border-l transition-colors ${
            copied
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
