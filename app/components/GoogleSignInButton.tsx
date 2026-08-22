import { signIn } from "@/auth";

export function GoogleSignInButton({
  redirectTo = "/home",
}: {
  redirectTo?: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo });
      }}
    >
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Continue with Google
      </button>
    </form>
  );
}
