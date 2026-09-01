import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Length is the requirement that actually matters, so the rule is a long minimum rather
 * than a pile of character-class rules that push people toward "Passw0rd!".
 */
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(200, "Password is too long.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(200);

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** Turns a Zod error into the single message the form should display. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the details you entered.";
}
