import { signInAsDev } from "@/lib/actions/dev-login";
import { isDevLoginEnabled, type DevLoginWho } from "@/lib/dev-login";

function DevSignInButton({
  who,
  label,
  redirectTo,
}: {
  who: DevLoginWho;
  label: string;
  redirectTo: string;
}) {
  return (
    <form action={signInAsDev}>
      <input type="hidden" name="who" value={who} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
      >
        {label}
      </button>
    </form>
  );
}

export function DevSignInButtons({
  redirectTo = "/home",
}: {
  redirectTo?: string;
}) {
  if (!isDevLoginEnabled()) return null;

  return (
    <div className="mt-6 border-t border-neutral-200 pt-6">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Development only
      </p>
      <div className="mt-3 space-y-2">
        <DevSignInButton
          who="owner"
          label="Sign in as Dev Owner"
          redirectTo={redirectTo}
        />
        <DevSignInButton
          who="member"
          label="Sign in as Dev Member"
          redirectTo={redirectTo}
        />
      </div>
    </div>
  );
}
