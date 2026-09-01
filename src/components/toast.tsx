"use client";

import { useEffect } from "react";
import { IconAlert } from "@/components/icons";

/**
 * Errors here are worth reading — a failed fetch usually needs a credential fixed — so this
 * stays until dismissed rather than timing out on its own.
 */
export default function Toast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="alert"
      className="animate-rise fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-red-200 bg-white p-4 shadow-lg shadow-slate-900/10"
    >
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
        <IconAlert className="h-3.5 w-3.5" />
      </span>
      <p className="flex-1 text-sm leading-snug text-slate-700">{message}</p>
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
