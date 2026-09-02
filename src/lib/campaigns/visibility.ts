// SECURITY REVIEW REQUIRED — AI-generated change to security-critical code
/**
 * Who is allowed to see the money.
 *
 * An agency's rates are the one thing on these screens that is nobody else's business: what
 * a creator is being paid, what the brand handed over, and the margin between the two. The
 * people doing the work need the stages, the deadlines and the tasks; they do not need the
 * figures, and in most agencies they are not meant to have them.
 *
 * So money is owner-only, and this is enforced where the data is read, not where it is
 * drawn. Hiding a figure in a component leaves it sitting in the JSON that the component
 * was handed, one devtools tab away from the person it was hidden from — which is not a
 * permission, only a decoration.
 *
 * Two consequences worth stating plainly:
 *
 * Payment tasks disappear for members rather than being greyed out, and the task counts and
 * the progress bar are worked out from what that person can see. A member and an owner
 * therefore read slightly different progress on the same campaign. That is the lesser of
 * two evils: the alternative is a tab reading "Tasks 13" above a list of eleven, which is a
 * discrepancy on one screen in front of one pair of eyes, rather than between two people who
 * rarely compare percentages.
 *
 * A member can still see that a creator reached Completed, and that the campaign has a
 * budget field they cannot read. Nothing pretends the money does not exist; it just does not
 * say how much.
 */

import { isMoneyActivity } from "@/lib/campaigns/activity";

export type Viewer = {
  id: string;
  /** True only for the OWNER role. Read from the database on every request, never a cookie. */
  canSeeMoney: boolean;
};

/** The task kind that only an owner may see. */
export const PAYMENT_TASK = "PAYMENT";

export function visibleTasks<T extends { kind: string }>(tasks: T[], viewer: Viewer): T[] {
  return viewer.canSeeMoney ? tasks : tasks.filter((task) => task.kind !== PAYMENT_TASK);
}

export function visibleActivity<T extends { kind: string }>(rows: T[], viewer: Viewer): T[] {
  return viewer.canSeeMoney ? rows : rows.filter((row) => !isMoneyActivity(row.kind));
}

/**
 * The figures as a member should receive them: absent, not zeroed.
 *
 * Zeroes would be a lie a screen could repeat — "Outstanding ₹0" reads as "everyone has been
 * paid". Null says the reader was not given the number, and the components render nothing
 * at all rather than a confident wrong answer.
 */
export function redactRate(rate: number | null, viewer: Viewer): number | null {
  return viewer.canSeeMoney ? rate : null;
}
