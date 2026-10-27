"use client";

import { useId, useState, type ReactNode } from "react";

import { coveringEntry } from "@/lib/sleep";

export function countPhrase(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  if (count === 0) return `No ${plural}`;
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural}`;
}

export function memberIdentity(member: {
  username: string | null;
  role: "OWNER" | "MEMBER";
  pending?: boolean;
}): string {
  if (member.pending) return "Hasn’t accepted";
  return [
    member.username ? `@${member.username}` : "No username yet",
    member.role === "OWNER" ? "Owner" : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export function datedDetail<T extends { effectiveFrom: string }>(
  entries: T[],
  onDate: string,
  label: (entry: T) => string,
): string | undefined {
  if (entries.length === 0) return undefined;
  const current = coveringEntry(entries, onDate);
  return current ? label(current) : "Starts later";
}

export function sectionMeta(
  count: number,
  singular: string,
  detail?: string,
  plural?: string,
): string {
  if (count === 0) return "None yet";
  const countText = countPhrase(count, singular, plural);
  return detail ? `${countText} · ${detail}` : countText;
}

const toneClass = {
  card: "rounded-md border border-neutral-200 bg-white",
  member: "rounded-md border border-neutral-200 bg-neutral-50",
  section: "rounded-md border border-neutral-200 bg-white",
} as const;

export function SettingsDisclosure({
  title,
  meta,
  heading,
  tone = "card",
  children,
}: {
  title: string;
  meta?: string;
  heading?: "h3" | "h4";
  tone?: keyof typeof toneClass;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Title = heading ?? "div";

  return (
    <section className={toneClass[tone]}>
      <Title>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-900/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-400"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">{title}</span>
            {meta ? (
              <span className="mt-0.5 block text-xs text-neutral-500">{meta}</span>
            ) : null}
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={`mt-0.5 h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </Title>
      <div
        id={panelId}
        hidden={!open}
        className="border-t border-neutral-200 px-4 py-4"
      >
        {children}
      </div>
    </section>
  );
}
