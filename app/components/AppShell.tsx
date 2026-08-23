import Link from "next/link";

export function AppShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const width = wide ? "max-w-6xl" : "max-w-3xl";

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur">
        <div className={`mx-auto flex ${width} items-center justify-between px-4 py-3`}>
          <Link href="/home" className="text-sm font-semibold tracking-tight">
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
      <main className={`mx-auto ${width} px-4 py-8`}>{children}</main>
    </div>
  );
}
