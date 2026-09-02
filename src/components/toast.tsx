"use client";

import { useEffect } from "react";
import { IconAlert, IconCheck, IconClose } from "@/components/icons";

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
      // Above the phone's tab bar, and across the full width there: a card floating in the
      // corner of a 390px screen is either cramped or covering the thing it is about.
      className={`animate-rise fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex items-start gap-3 rounded-xl border bg-white p-3.5 pr-3 shadow-xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:max-w-sm ${
        good ? "border-emerald-200/80" : "border-rose-200/80"
      }`}
    >
      <span
        className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full ${
          good ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        }`}
      >
        {good ? <IconCheck className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />}
      </span>
      <p className="flex-1 pt-0.5 text-[13px] leading-snug text-slate-700">{notice.message}</p>
      <button
        className="-mt-0.5 shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <IconClose className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
