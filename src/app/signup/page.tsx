import Link from "next/link";
import AuthShell from "@/components/auth-shell";
import { deploymentClaimed } from "@/lib/access";
import SignupForm from "./signup-form";

// The heading depends on whether anyone has signed up yet, which cannot be baked in.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const claimed = await deploymentClaimed().catch(() => true);

  return (
    <AuthShell
      title={claimed ? "Create your account" : "Claim this deployment"}
      subtitle={
        claimed
          ? "Invite only — use the address its owner added."
          : "You are the first here, so this account becomes the owner and decides who else gets in."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-indigo-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
