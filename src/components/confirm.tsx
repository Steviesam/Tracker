"use client";

import { useEffect, useRef } from "react";
import { IconAlert } from "@/components/icons";

export type ConfirmRequest = {
  title: string;
  /** What will actually happen, in plain words. Not "are you sure?". */
  body: string;
  /** The button's own label says what it does, so it reads right out of context. */
  action: string;
  onConfirm: () => void;
};

/**
 * A last check before something cannot be undone.
 *
 * The browser's own `confirm()` would do the job, but it blocks the page and looks like a
 * phishing box, and on a tool people use all day that is the difference between reading the
 * question and clicking through it. This says what is about to be lost — the tasks that go
 * with an influencer, the money already recorded against them — because "Are you sure?" is a
 * question nobody can answer.
 */
export default function Confirm({
  request,
  onCancel,
}: {
  request: ConfirmRequest | null;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    // Focus lands on Cancel, not on the destructive button: a stray Enter should do nothing.
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onCancel]);

  if (!request) return null;

  return (
    <div
      className="animate-fade fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onClick={onCancel}
    >
      <div
        className="animate-pop w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600">
            <IconAlert className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold">{request.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{request.body}</p>
          </div>
        </div>

        {/* Confirm above cancel on a phone, both full width: the pair reads top to bottom in
            the order the question was asked, and neither needs an accurate tap. */}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} className="btn-secondary w-full sm:w-auto" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-danger w-full sm:w-auto"
            onClick={() => {
              request.onConfirm();
              onCancel();
            }}
          >
            {request.action}
          </button>
        </div>
      </div>
    </div>
  );
}
