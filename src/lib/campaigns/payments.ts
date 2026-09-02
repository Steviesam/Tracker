/**
 * Who has been paid, and what the campaign still owes.
 *
 * Chasing payments is the thing agencies forget, and the thing a spreadsheet is worst at:
 * a "Paid?" column with Y and N cannot express half up front, and goes stale the moment
 * someone transfers money without opening the file.
 *
 * So the only thing stored is how much has actually been handed over. Everything shown —
 * unpaid, part paid, settled, outstanding — is worked out from that against the agreed rate,
 * which means a status can never contradict the number sitting next to it.
 */

export type PaymentState =
  /** No rate agreed yet, so there is nothing to owe. */
  | "NO_RATE"
  | "UNPAID"
  | "PART_PAID"
  | "PAID";

export type PaymentRow = { agreedRate: number | null; amountPaid: number };

export function paymentState({ agreedRate, amountPaid }: PaymentRow): PaymentState {
  if (agreedRate === null || agreedRate === 0) return "NO_RATE";
  if (amountPaid <= 0) return "UNPAID";
  // Paying slightly over — a rounded transfer, a bonus — still settles it.
  return amountPaid >= agreedRate ? "PAID" : "PART_PAID";
}

export const PAYMENT_LABEL: Record<PaymentState, string> = {
  NO_RATE: "No rate",
  UNPAID: "Unpaid",
  PART_PAID: "Part paid",
  PAID: "Paid",
};

export type Money = {
  /** What the brand gave us, when it was recorded. */
  budget: number | null;
  /** Everything promised to creators, whether paid or not. */
  committed: number;
  paid: number;
  /** Promised and still owed. Never negative. */
  outstanding: number;
  /** How many creators are still owed something. */
  owedTo: number;
  /**
   * Committed more than the budget.
   *
   * Shown rather than blocked: agreeing a rate that takes a campaign over budget is a real
   * decision people make, and a tool that refuses to record it just gets worked around.
   */
  overBudget: boolean;
};

export function money(rows: PaymentRow[], budget: number | null): Money {
  let committed = 0;
  let paid = 0;
  let owedTo = 0;

  for (const row of rows) {
    const rate = row.agreedRate ?? 0;
    const given = Math.max(0, row.amountPaid);
    committed += rate;
    // Paying over the agreed rate must not inflate the campaign's paid total.
    paid += Math.min(given, rate);
    if (rate > given) owedTo += 1;
  }

  return {
    budget,
    committed,
    paid,
    outstanding: Math.max(0, committed - paid),
    owedTo,
    overBudget: budget !== null && committed > budget,
  };
}
