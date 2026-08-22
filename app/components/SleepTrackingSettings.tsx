"use client";

import { useActionState, useState } from "react";
import { ConfirmForm } from "@/components/ConfirmForm";
import type { ActionState } from "@/lib/actions/profile";
import {
  deleteSleepOverride,
  deleteSleepPenalty,
  deleteSleepSchedule,
  saveSleepOverride,
  saveSleepPenalty,
  saveSleepSchedule,
  updateGroupTracking,
} from "@/lib/actions/sleep";
import {
  DEFAULT_PENALTY_AMOUNT,
  MAX_UNIT_LABEL_LENGTH,
  PENALTY_UNITS,
  PENALTY_UNIT_LABELS,
  type PenaltyUnit,
} from "@/lib/penalty";
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  coveringTimezone,
  defaultSleepTimes,
  DEFAULT_HALF_HOURS_PAST_8PM,
  DEFAULT_TIMEZONE,
  bedtimeOptions,
  type SleepTimesByWeekday,
} from "@/lib/sleep";

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500";

const primaryButtonClass =
  "rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60";

const deleteButtonClass =
  "rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50";

const BEDTIME_OPTIONS = bedtimeOptions();

export type SleepScheduleView = {
  id: string;
  effectiveFrom: string;
  timezone: string;
  times: SleepTimesByWeekday;
};

export type SleepOverrideView = {
  id: string;
  date: string;
  timezone: string;
  halfHoursPast8pm: number;
  note: string | null;
};

export type SleepPenaltyView = {
  id: string;
  effectiveFrom: string;
  amount: string;
  unit: PenaltyUnit;
  unitLabel: string | null;
};

export type SleepMemberView = {
  id: string;
  displayName: string;
  username: string | null;
  role: "OWNER" | "MEMBER";
  schedules: SleepScheduleView[];
  overrides: SleepOverrideView[];
  penalties: SleepPenaltyView[];
};

function FieldMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return <p className="text-sm text-red-700">{state.error}</p>;
  }
  if (state.success) {
    return <p className="text-sm text-green-700">{state.success}</p>;
  }
  return null;
}

function TimeZoneSelect({
  name,
  defaultValue,
  timeZones,
}: {
  name: string;
  defaultValue: string;
  timeZones: string[];
}) {
  const options = timeZones.includes(defaultValue)
    ? timeZones
    : [defaultValue, ...timeZones];

  return (
    <select name={name} required defaultValue={defaultValue} className={inputClass}>
      {options.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}

function BedtimeSelect({
  name,
  defaultValue,
  className = inputClass,
}: {
  name: string;
  defaultValue: number;
  className?: string;
}) {
  return (
    <select name={name} required defaultValue={defaultValue} className={className}>
      {BEDTIME_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function TrackingToggle({
  groupId,
  enabled,
}: {
  groupId: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(updateGroupTracking, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="groupId" value={groupId} />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="sleepTracking"
          value="on"
          defaultChecked={enabled}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Sleep time based on gadget usage</span>
          <span className="mt-1 block text-xs text-neutral-500">
            When this is on, you can set each member’s bedtime schedule. Unchecking
            hides the editor but keeps saved schedules.
          </span>
        </span>
      </label>
      <FieldMessage state={state} />
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Saving…" : "Save tracking"}
      </button>
    </form>
  );
}

function ScheduleForm({
  groupId,
  groupMemberId,
  schedule,
  timeZones,
  defaultDate,
}: {
  groupId: string;
  groupMemberId: string;
  schedule?: SleepScheduleView;
  timeZones: string[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(saveSleepSchedule, {});
  const times = schedule?.times ?? defaultSleepTimes();

  const bedtimeSelectClass =
    "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500";

  return (
    <div className="flex min-w-0 flex-col space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <form action={action} className="flex min-w-0 flex-1 flex-col space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="groupMemberId" value={groupMemberId} />
        {schedule ? <input type="hidden" name="scheduleId" value={schedule.id} /> : null}

        <p className="text-sm font-medium">
          {schedule ? "Weekly schedule" : "Add a weekly schedule"}
        </p>

        <label className="block text-sm">
          Effective starting date
          <input
            type="date"
            name="effectiveFrom"
            required
            defaultValue={schedule?.effectiveFrom ?? defaultDate}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Nights before this date aren’t covered.
          </span>
        </label>

        <label className="block min-w-0 text-sm">
          Timezone
          <TimeZoneSelect
            name="timezone"
            defaultValue={schedule?.timezone ?? DEFAULT_TIMEZONE}
            timeZones={timeZones}
          />
        </label>

        <fieldset className="space-y-1.5">
          <legend className="text-sm">Bedtime by day</legend>
          {WEEKDAYS.map((day) => (
            <label key={day} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-neutral-600">
                {WEEKDAY_LABELS[day].slice(0, 3)}
              </span>
              <BedtimeSelect
                name={`time-${day}`}
                defaultValue={times[day]}
                className={bedtimeSelectClass}
              />
            </label>
          ))}
        </fieldset>

        <FieldMessage state={state} />
        <button type="submit" disabled={pending} className={`${primaryButtonClass} mt-auto`}>
          {pending ? "Saving…" : schedule ? "Save schedule" : "Add schedule"}
        </button>
      </form>
      {schedule ? (
        <ConfirmForm
          action={deleteSleepSchedule}
          hidden={{ groupId, scheduleId: schedule.id }}
          confirmMessage="Delete this weekly schedule?"
          className={deleteButtonClass}
        >
          Delete
        </ConfirmForm>
      ) : null}
    </div>
  );
}

function OverrideForm({
  groupId,
  groupMemberId,
  override,
  timeZones,
  defaultDate,
  defaultTimezone,
}: {
  groupId: string;
  groupMemberId: string;
  override?: SleepOverrideView;
  timeZones: string[];
  defaultDate: string;
  defaultTimezone: string;
}) {
  const [state, action, pending] = useActionState(saveSleepOverride, {});

  return (
    <div className="flex min-w-0 flex-col space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <form action={action} className="flex min-w-0 flex-1 flex-col space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="groupMemberId" value={groupMemberId} />
        {override ? <input type="hidden" name="overrideId" value={override.id} /> : null}

        <p className="text-sm font-medium">
          {override ? "Night override" : "Add a one-day override"}
        </p>

        <label className="block text-sm">
          Night of
          <input
            type="date"
            name="date"
            required
            defaultValue={override?.date ?? defaultDate}
            className={inputClass}
          />
        </label>

        <label className="block min-w-0 text-sm">
          Timezone
          <TimeZoneSelect
            name="timezone"
            defaultValue={override?.timezone ?? defaultTimezone}
            timeZones={timeZones}
          />
        </label>

        <label className="block text-sm">
          Bedtime
          <BedtimeSelect
            name="halfHoursPast8pm"
            defaultValue={override?.halfHoursPast8pm ?? DEFAULT_HALF_HOURS_PAST_8PM}
          />
        </label>

        <label className="block text-sm">
          Note <span className="text-neutral-500">(optional)</span>
          <input
            name="note"
            defaultValue={override?.note ?? ""}
            className={inputClass}
          />
        </label>

        <FieldMessage state={state} />
        <button type="submit" disabled={pending} className={`${primaryButtonClass} mt-auto`}>
          {pending ? "Saving…" : override ? "Save override" : "Add override"}
        </button>
      </form>
      {override ? (
        <ConfirmForm
          action={deleteSleepOverride}
          hidden={{ groupId, overrideId: override.id }}
          confirmMessage="Delete this one-day override?"
          className={deleteButtonClass}
        >
          Delete
        </ConfirmForm>
      ) : null}
    </div>
  );
}

function MemberSleepCard({
  groupId,
  member,
  timeZones,
  defaultDate,
}: {
  groupId: string;
  member: SleepMemberView;
  timeZones: string[];
  defaultDate: string;
}) {
  const overrideTimezone = coveringTimezone(member.schedules, defaultDate);

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <div>
        <p className="text-sm font-medium">{member.displayName}</p>
        <p className="text-xs text-neutral-500">
          {member.username ? `@${member.username}` : "No username yet"}
          {member.role === "OWNER" ? " · Owner" : ""}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Weekly schedules
        </h4>
        <p className="text-xs text-neutral-500">
          Add another schedule when someone travels — a new start date and timezone.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {member.schedules.map((schedule) => (
            <ScheduleForm
              key={schedule.id}
              groupId={groupId}
              groupMemberId={member.id}
              schedule={schedule}
              timeZones={timeZones}
              defaultDate={defaultDate}
            />
          ))}
          <ScheduleForm
            key={`new-schedule-${member.schedules.map((s) => s.id).join(",")}`}
            groupId={groupId}
            groupMemberId={member.id}
            timeZones={timeZones}
            defaultDate={defaultDate}
          />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          One-day overrides
        </h4>
        <p className="text-xs text-neutral-500">
          Use these for holidays or stay-overs, not for a whole trip.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {member.overrides.map((override) => (
            <OverrideForm
              key={override.id}
              groupId={groupId}
              groupMemberId={member.id}
              override={override}
              timeZones={timeZones}
              defaultDate={defaultDate}
              defaultTimezone={overrideTimezone}
            />
          ))}
          <OverrideForm
            key={`new-override-${member.overrides.map((o) => o.id).join(",")}`}
            groupId={groupId}
            groupMemberId={member.id}
            timeZones={timeZones}
            defaultDate={defaultDate}
            defaultTimezone={overrideTimezone}
          />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Late-sleep penalty
        </h4>
        <p className="text-xs text-neutral-500">
          Add another period when the rate changes. The latest start date on or
          before a night is the one that applies.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {member.penalties.map((penalty) => (
            <PenaltyForm
              key={penalty.id}
              groupId={groupId}
              groupMemberId={member.id}
              penalty={penalty}
              defaultDate={defaultDate}
            />
          ))}
          <PenaltyForm
            key={`new-penalty-${member.penalties.map((p) => p.id).join(",")}`}
            groupId={groupId}
            groupMemberId={member.id}
            defaultDate={defaultDate}
          />
        </div>
      </div>
    </div>
  );
}

function PenaltyForm({
  groupId,
  groupMemberId,
  penalty,
  defaultDate,
}: {
  groupId: string;
  groupMemberId: string;
  penalty?: SleepPenaltyView;
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(saveSleepPenalty, {});
  const [unit, setUnit] = useState<PenaltyUnit>(penalty?.unit ?? "MONEY");

  return (
    <div className="flex min-w-0 flex-col space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <form action={action} className="flex min-w-0 flex-1 flex-col space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="groupMemberId" value={groupMemberId} />
        {penalty ? <input type="hidden" name="penaltyId" value={penalty.id} /> : null}

        <p className="text-sm font-medium">
          {penalty ? "Penalty period" : "Add a penalty"}
        </p>

        <label className="block text-sm">
          Effective starting date
          <input
            type="date"
            name="effectiveFrom"
            required
            defaultValue={penalty?.effectiveFrom ?? defaultDate}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Nights before this date aren’t covered.
          </span>
        </label>

        <label className="block text-sm">
          Amount
          <input
            type="number"
            name="amount"
            required
            min="0"
            step="0.01"
            defaultValue={penalty?.amount ?? DEFAULT_PENALTY_AMOUNT}
            className={inputClass}
          />
        </label>

        <label className="block text-sm">
          Unit
          <select
            name="unit"
            required
            value={unit}
            onChange={(event) => setUnit(event.target.value as PenaltyUnit)}
            className={inputClass}
          >
            {PENALTY_UNITS.map((option) => (
              <option key={option} value={option}>
                {PENALTY_UNIT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        {unit === "OTHER" ? (
          <label className="block text-sm">
            Specify unit
            <input
              name="unitLabel"
              required
              maxLength={MAX_UNIT_LABEL_LENGTH}
              defaultValue={penalty?.unitLabel ?? ""}
              placeholder="e.g. push-ups"
              className={inputClass}
            />
          </label>
        ) : null}

        <p className="text-xs text-neutral-500">
          Charged per half hour past bedtime.
        </p>

        <FieldMessage state={state} />
        <button type="submit" disabled={pending} className={`${primaryButtonClass} mt-auto`}>
          {pending ? "Saving…" : penalty ? "Save penalty" : "Add penalty"}
        </button>
      </form>
      {penalty ? (
        <ConfirmForm
          action={deleteSleepPenalty}
          hidden={{ groupId, penaltyId: penalty.id }}
          confirmMessage="Delete this late-sleep penalty?"
          className={deleteButtonClass}
        >
          Delete
        </ConfirmForm>
      ) : null}
    </div>
  );
}

export function SleepTrackingSettings({
  groupId,
  sleepTrackingEnabled,
  members,
  timeZones,
  defaultDate,
}: {
  groupId: string;
  sleepTrackingEnabled: boolean;
  members: SleepMemberView[];
  timeZones: string[];
  defaultDate: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-neutral-500">Tracking</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Choose what this group tracks. Only the owner can change these settings.
      </p>
      <div className="mt-4 rounded-md border border-neutral-200 bg-white p-4">
        <TrackingToggle
          key={String(sleepTrackingEnabled)}
          groupId={groupId}
          enabled={sleepTrackingEnabled}
        />
      </div>

      {sleepTrackingEnabled ? (
        <div className="mt-4 space-y-4">
          {members.map((member) => (
            <MemberSleepCard
              key={member.id}
              groupId={groupId}
              member={member}
              timeZones={timeZones}
              defaultDate={defaultDate}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
