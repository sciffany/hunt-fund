import Link from "next/link";
import { redirect } from "next/navigation";
import { DevSignInButtons } from "@/components/DevSignInButtons";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getCurrentUser } from "@/lib/session";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.username ? "/home" : "/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Group Fund</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Create a group and invite people by username or email. They join only
        after they accept.
      </p>
      <div className="mt-8">
        <GoogleSignInButton />
        <DevSignInButtons />
      </div>
      <p className="mt-4 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </main>
  );
}
