import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DevSignInButtons } from "@/components/DevSignInButtons";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.username ? "/home" : "/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Sign in with Google to continue.
      </p>
      <div className="mt-8">
        <GoogleSignInButton />
        <DevSignInButtons />
      </div>
    </main>
  );
}
