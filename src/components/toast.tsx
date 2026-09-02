"use client";

import { useEffect } from "react";
import { IconAlert, IconCheck } from "@/components/icons";

export type NoticeTone = "error" | "success";

export type Notice = { message: string; tone: NoticeTone };

/**
 * Errors here are worth reading — a failed fetch usually needs a credential fixed — so an
 * error stays until dismissed rather than timing out on its own.
 *
 * A confirmation is the opposite: it is telling you something already went right, so it
 * clears itself and never wears the red that means "something needs you". Dressing "Added 2
 * influencers" as an alarm teaches people to dismiss the banner without reading it, and then
 * the real errors go unread too.
 */
export default function Toast({
  notice,
  onDismiss,
}: {
  notice: Notice | null;
  onDismiss: () => void;
}) {
  const tone = notice?.tone;

  useEffect(() => {
    if (!notice) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notice, onDismiss]);

  useEffect(() => {
    if (tone !== "success") return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [tone, onDismiss]);

  if (!notice) return null;

  const good = notice.tone === "success";

  return (
    <div
      role={good ? "status" : "alert"}
      className={`animate-rise fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border bg-white p-4 shadow-lg shadow-slate-900/10 ${
        good ? "border-emerald-200" : "border-red-200"
      }`}
    >
      <span
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
          good ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
        }`}
      >
        {good ? <IconCheck className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />}
      </span>
      <p className="flex-1 text-sm leading-snug text-slate-700">{notice.message}</p>
      <button
        className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-900"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
