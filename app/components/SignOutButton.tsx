import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
      >
        Sign out
      </button>
    </form>
  );
}
