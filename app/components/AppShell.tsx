import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/home" className="text-sm font-medium">
            Group Fund
          </Link>
          <nav className="flex items-center gap-4 text-sm text-neutral-600">
            <Link href="/home" className="hover:text-neutral-900">
              Home
            </Link>
            <Link href="/settings" className="hover:text-neutral-900">
              Settings
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
