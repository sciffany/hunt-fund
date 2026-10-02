"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  deleteSleepEvent,
  deleteSleepEvents,
  listSleepNightEvents,
  type SleepNightEventView,
} from "@/lib/actions/sleep";
import { weekdayShort } from "@/lib/month";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      canDelete: boolean;
      countedAtLabel: string | null;
      events: SleepNightEventView[];
    };

export function SleepNightEventsDialog({
  groupId,
  memberId,
  memberName,
  night,
  tableTime,
  onClose,
}: {
  groupId: string;
  memberId: string;
  memberName: string;
  night: string;
  tableTime: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const anchorIndex = useRef<number | null>(null);
  const shiftHeld = useRef(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoad((current) =>
      reloadToken > 0 && current.status === "ready"
        ? current
        : { status: "loading" },
    );
    setDeleteError(null);
    listSleepNightEvents(groupId, memberId, night).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoad({ status: "error", message: result.error });
        return;
      }
      setLoad({
        status: "ready",
        canDelete: result.canDelete,
        countedAtLabel: result.countedAtLabel,
        events: result.events,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [groupId, memberId, night, reloadToken]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (load.status !== "ready") return;
    const row = document.getElementById("deciding-sleep-event");
    const scroller = scrollerRef.current;
    if (!row || !scroller) return;
    const top =
      row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (top < 0 || top + row.offsetHeight > scroller.clientHeight) {
      scroller.scrollTop += top - 8;
    }
  }, [load]);

  const nightLabel = `${weekdayShort(night)} ${night}`;
  const readyEvents = load.status === "ready" ? load.events : [];
  const selectedCount = readyEvents.filter((event) => selected.has(event.id)).length;
  const allSelected = readyEvents.length > 0 && selectedCount === readyEvents.length;

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);

  const toggleAll = () => {
    if (load.status !== "ready" || isPending) return;
    anchorIndex.current = null;
    setSelected(
      allSelected ? new Set() : new Set(load.events.map((event) => event.id)),
    );
  };

  const toggleOne = (id: string, index: number, shiftKey: boolean) => {
    if (load.status !== "ready" || isPending) return;
    setSelected((current) => {
      const next = new Set(current);
      if (shiftKey && anchorIndex.current != null) {
        const start = Math.min(anchorIndex.current, index);
        const end = Math.max(anchorIndex.current, index);
        const select = !current.has(id);
        for (let i = start; i <= end; i++) {
          const eventId = load.events[i]?.id;
          if (!eventId) continue;
          if (select) next.add(eventId);
          else next.delete(eventId);
        }
        return next;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorIndex.current = index;
  };

  const removeEvent = (event: SleepNightEventView) => {
    if (load.status !== "ready" || !load.canDelete || isPending) return;
    const confirmed = window.confirm(
      `Delete this ${event.label.toLowerCase()} at ${event.timeLabel}? This night will be recalculated.`,
    );
    if (!confirmed) return;

    setPendingDelete(event.id);
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteSleepEvent(groupId, event.id, night);
      setPendingDelete(null);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setSelected((current) => {
        if (!current.has(event.id)) return current;
        const next = new Set(current);
        next.delete(event.id);
        return next;
      });
      setReloadToken((token) => token + 1);
      router.refresh();
    });
  };

  const removeSelected = () => {
    if (load.status !== "ready" || !load.canDelete || isPending) return;
    const ids = load.events
      .filter((event) => selected.has(event.id))
      .map((event) => event.id);
    if (ids.length === 0) return;
    const confirmed = window.confirm(
      ids.length === 1
        ? "Delete this event? This night will be recalculated."
        : `Delete ${ids.length.toLocaleString("en-SG")} events? This night will be recalculated.`,
    );
    if (!confirmed) return;

    setPendingDelete("bulk");
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteSleepEvents(groupId, ids, night);
      setPendingDelete(null);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setSelected(new Set());
      anchorIndex.current = null;
      setReloadToken((token) => token + 1);
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3.5">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-neutral-900">
              {memberName}
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {nightLabel}
              {tableTime ? ` · shown as ${tableTime}` : " · no activity recorded"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sleep events"
            className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            Close
          </button>
        </div>

        <div ref={scrollerRef} className="overflow-y-auto px-4 py-3">
          <p className="text-xs text-neutral-500">
            Events from 8:00 PM to 6:00 AM that set this night. The marked event
            is the one the table uses.
            {load.status === "ready" && load.canDelete
              ? " Select events to delete them together. Deleting recalculates the night."
              : ""}
          </p>

          {load.status === "loading" ? (
            <p className="py-8 text-center text-sm text-neutral-500">Loading events…</p>
          ) : null}

          {load.status === "error" ? (
            <p className="py-8 text-center text-sm text-red-700">{load.message}</p>
          ) : null}

          {load.status === "ready" ? (
            <>
              {load.countedAtLabel ? (
                <p className="mt-3 text-sm text-neutral-800">
                  Counted as{" "}
                  <span className="font-medium tabular-nums">
                    {`${load.countedAtLabel}${
                      tableTime && tableTime !== load.countedAtLabel
                        ? `, rounded up to ${tableTime} on the table`
                        : ""
                    }.`}
                  </span>
                </p>
              ) : (
                <p className="mt-3 text-sm text-neutral-800">
                  Nothing in this window counted as activity.
                </p>
              )}

              {deleteError ? (
                <p className="mt-2 text-sm text-red-700">{deleteError}</p>
              ) : null}

              {load.events.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                  No sleep events in this window.
                </p>
              ) : (
                <>
                  {load.canDelete ? (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allSelected}
                          disabled={isPending}
                          onChange={toggleAll}
                          className="size-4 accent-rose-700"
                        />
                        Select all
                      </label>
                      <button
                        type="button"
                        disabled={isPending || selectedCount === 0}
                        onClick={removeSelected}
                        className="shrink-0 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        {pendingDelete === "bulk"
                          ? "Deleting…"
                          : selectedCount > 0
                            ? `Delete ${selectedCount.toLocaleString("en-SG")} selected`
                            : "Delete selected"}
                      </button>
                    </div>
                  ) : null}
                  <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
                    {load.events.map((event, index) => (
                      <li
                        key={event.id}
                        id={event.decides ? "deciding-sleep-event" : undefined}
                        className={`flex items-start gap-3 py-2.5 ${
                          event.decides ? "-mx-2 bg-amber-50 px-2" : ""
                        }`}
                      >
                        {load.canDelete ? (
                          <input
                            type="checkbox"
                            checked={selected.has(event.id)}
                            disabled={isPending}
                            aria-label={`Select ${event.label} at ${event.timeLabel}`}
                            onMouseDown={(pointer) => {
                              shiftHeld.current = pointer.shiftKey;
                            }}
                            onKeyDown={(key) => {
                              shiftHeld.current = key.shiftKey;
                            }}
                            onChange={() =>
                              toggleOne(event.id, index, shiftHeld.current)
                            }
                            className="mt-0.5 size-4 accent-rose-700"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-neutral-900">
                            {event.label}
                            {event.decides ? (
                              <span className="ml-2 align-middle text-[11px] font-medium uppercase tracking-wide text-amber-800">
                                Sets this night
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-neutral-500">
                            {event.timeLabel}
                          </p>
                          {event.note ? (
                            <p className="mt-1 text-xs text-neutral-600">{event.note}</p>
                          ) : null}
                        </div>
                        {load.canDelete ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => removeEvent(event)}
                            className="shrink-0 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            {pendingDelete === event.id ? "Deleting…" : "Delete"}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {load.events.length > 0 ? (
                <p className="mt-2 text-xs text-neutral-400">
                  {load.events.length.toLocaleString("en-SG")}{" "}
                  {load.events.length === 1 ? "event" : "events"}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
