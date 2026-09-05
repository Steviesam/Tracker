"use client";

import { useCallback, useEffect, useState } from "react";
import { IconAlert, IconArrow, IconCheck, IconKey, IconRefresh, IconTrash } from "@/components/icons";
import { ROLE_BLURB, ROLE_LABEL, ROLES, type Role } from "@/lib/access";

type Invite = {
  id: string;
  email: string;
  /** Null until they have signed up: an unused invite is an address, not an account. */
  role: Role | null;
  /** There can be more than one owner, so this is not just "is this me". */
  isOwner: boolean;
  /** Set once they have signed up; until then the invite is unused. */
  acceptedAt: string | null;
  createdAt: string;
};

type Props = {
  /** The signed-in owner, so their own row can say so and cannot be removed. */
  email: string;
  onError: (message: string) => void;
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AccessSection({ email, onError }: Props) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/access");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(body.error ?? "Could not load the access list.");
        return;
      }
      setInvites(body.invites ?? []);
    } catch {
      onError("Could not load the access list.");
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    const value = input.trim();
    if (!value) return;
    setBusy(true);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(body.error ?? "Could not add that email.");
        return;
      }
      setInput("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/access?email=${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(body.error ?? "Could not remove that email.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setRole(target: string, role: Role) {
    setBusy(true);
    try {
      const response = await fetch("/api/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target, role }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(body.error ?? "Could not change that role.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
            <IconKey className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Invite someone</p>
            <p className="text-sm text-slate-500">
              They can then create an account with this address. Anyone else who opens the
              sign-up page is turned away.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="field w-full sm:flex-1"
            type="email"
            placeholder="name@example.com"
            value={input}
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
          />
          <button
            className="btn-primary w-full sm:w-auto"
            disabled={busy || input.trim().length === 0}
            onClick={() => void add()}
          >
            {busy ? <IconRefresh className="h-4 w-4 animate-spin" /> : null}
            Invite
            <IconArrow className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold">
            {invites === null ? "Who has access" : `${invites.length} with access`}
          </p>
          <button className="btn-secondary" onClick={() => void load()} disabled={busy}>
            <IconRefresh className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {invites === null ? (
          <div className="space-y-2 p-4">
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
          </div>
        ) : invites.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Nobody has been invited yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invites.map((invite) => {
              const isYou = invite.email === email;
              return (
                <li key={invite.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{invite.email}</span>

                  {invite.acceptedAt ? (
                    <span className="chip bg-emerald-50 text-emerald-700 ring-emerald-200">
                      <IconCheck className="h-3 w-3" />
                      Signed up {when(invite.acceptedAt)}
                    </span>
                  ) : (
                    <span className="chip bg-slate-100 text-slate-600 ring-slate-200">
                      Invited {when(invite.createdAt)}
                    </span>
                  )}

                  {/*
                    A dropdown rather than a pair of buttons, now that there are three
                    roles: two buttons could only say "make the other one", which stops
                    reading as an answer the moment there is a third option.

                    Nobody may change their own role, so a deployment cannot be left with no
                    owner and handing over control always takes two people.
                  */}
                  {invite.role === null ? null : isYou ? (
                    <span className="chip bg-indigo-50 text-indigo-700 ring-indigo-200">
                      <IconKey className="h-3 w-3" />
                      You · {ROLE_LABEL[invite.role].toLowerCase()}
                    </span>
                  ) : (
                    <select
                      className="field-sm w-auto"
                      value={invite.role}
                      disabled={busy}
                      title={ROLE_BLURB[invite.role]}
                      aria-label={`Role for ${invite.email}`}
                      onChange={(event) => void setRole(invite.email, event.target.value as Role)}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                  )}

                  {isYou || invite.isOwner ? null : (
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      title={
                        invite.acceptedAt
                          ? "Deletes their account and signs them out"
                          : "Withdraws the invite"
                      }
                      onClick={() => void remove(invite.email)}
                    >
                      <IconTrash className="h-4 w-4" />
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="space-y-2">
          <p>
            Removing someone deletes their account and ends their session immediately. Their
            uploaded directory stays — it belongs to the deployment, not to one person. You
            cannot change your own role, which is what stops a deployment losing its last owner.
          </p>
          <ul className="space-y-0.5">
            {ROLES.map((role) => (
              <li key={role}>
                <span className="font-medium text-slate-700">{ROLE_LABEL[role]}</span> —{" "}
                {ROLE_BLURB[role]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
