import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-neutral-600">
        This page doesn’t exist, or you don’t have access to it.
      </p>
      <Link href="/home" className="mt-6 text-sm underline underline-offset-2">
        Back to home
      </Link>
    </main>
  );
}
