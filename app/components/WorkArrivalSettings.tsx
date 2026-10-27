"use client";

import { useActionState, useState } from "react";
import { PlacePickerMap } from "@/components/PlacePickerMap";
import { ConfirmForm } from "@/components/ConfirmForm";
import {
  countPhrase,
  datedDetail,
  memberIdentity,
  sectionMeta,
  SettingsDisclosure,
} from "@/components/SettingsDisclosure";
import type { ActionState } from "@/lib/actions/profile";
import {
  deleteWorkArrivalOverride,
  deleteWorkArrivalPenalty,
  deleteWorkArrivalTarget,
  saveWorkArrivalOverride,
  saveWorkArrivalPenalty,
  saveWorkArrivalTarget,
} from "@/lib/actions/work-arrival";
import {
  DEFAULT_PENALTY_AMOUNT,
  formatPenaltyRate,
  MAX_UNIT_LABEL_LENGTH,
  PENALTY_UNITS,
  PENALTY_UNIT_LABELS,
  type PenaltyUnit,
} from "@/lib/penalty";
import {
  DEFAULT_TIMEZONE,
  WEEKDAYS,
  WEEKDAY_LABELS,
} from "@/lib/sleep";
import {
  DEFAULT_ARRIVAL_MINUTES,
  DEFAULT_BLOCK_MINUTES,
  DEFAULT_RADIUS_METERS,
  MAX_RADIUS_METERS,
  defaultWorkdays,
  formatArrivalInput,
  formatArrivalMinutes,
  type WeekdayChecklist,
} from "@/lib/work-arrival";

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500";

const primaryButtonClass =
  "rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60";

const deleteButtonClass =
  "rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50";

export type WorkArrivalTargetView = {
  id: string;
  effectiveFrom: string;
  timezone: string;
  arrivalMinutes: number;
  days: WeekdayChecklist;
  latitude: string;
  longitude: string;
  radiusMeters: number;
};

export type WorkArrivalOverrideView = {
  id: string;
  date: string;
  timezone: string;
  arrivalMinutes: number;
  note: string | null;
};

export type WorkArrivalPenaltyView = {
  id: string;
  effectiveFrom: string;
  amount: string;
  unit: PenaltyUnit;
  unitLabel: string | null;
  blockMinutes: number;
  cap: string;
};

export type WorkArrivalMemberView = {
  id: string;
  displayName: string;
  username: string | null;
  role: "OWNER" | "MEMBER";
  targets: WorkArrivalTargetView[];
  overrides: WorkArrivalOverrideView[];
  penalties: WorkArrivalPenaltyView[];
};

function FieldMessage({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p className="text-sm text-green-700">{state.success}</p>;
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

function countedDays(days: WeekdayChecklist): string {
  const labels = WEEKDAYS.filter((day) => days[day]).map(
    (day) => WEEKDAY_LABELS[day].slice(0, 3),
  );
  return labels.length === 0 ? "No weekdays" : labels.join(", ");
}

function WeekdayChecklistFields({ days }: { days: WeekdayChecklist }) {
  return (
    <fieldset className="text-sm">
      <legend>Days that count</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {WEEKDAYS.map((day) => (
          <label key={day} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              name="day"
              value={String(day)}
              defaultChecked={days[day]}
            />
            {WEEKDAY_LABELS[day].slice(0, 3)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TargetForm({
  groupId,
  groupMemberId,
  target,
  timeZones,
  defaultDate,
}: {
  groupId: string;
  groupMemberId: string;
  target?: WorkArrivalTargetView;
  timeZones: string[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(saveWorkArrivalTarget, {});
  const [latitude, setLatitude] = useState(target?.latitude ?? "");
  const [longitude, setLongitude] = useState(target?.longitude ?? "");
  const [radiusMeters, setRadiusMeters] = useState(
    String(target?.radiusMeters ?? DEFAULT_RADIUS_METERS),
  );
  const days = target?.days ?? defaultWorkdays();
  const radiusValue = Number(radiusMeters);
  const radiusForMap =
    Number.isInteger(radiusValue) &&
    radiusValue >= 1 &&
    radiusValue <= MAX_RADIUS_METERS
      ? radiusValue
      : DEFAULT_RADIUS_METERS;

  return (
    <div className="flex min-w-0 flex-col space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <form action={action} className="flex min-w-0 flex-1 flex-col space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="groupMemberId" value={groupMemberId} />
        {target ? <input type="hidden" name="targetId" value={target.id} /> : null}
        <p className="text-sm font-medium">
          {target ? "Arrival target" : "Add an arrival target"}
        </p>
        <label className="block text-sm">
          Effective starting date
          <input
            type="date"
            name="effectiveFrom"
            required
            defaultValue={target?.effectiveFrom ?? defaultDate}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Timezone
          <TimeZoneSelect
            name="timezone"
            defaultValue={target?.timezone ?? DEFAULT_TIMEZONE}
            timeZones={timeZones}
          />
        </label>
        <label className="block text-sm">
          Arrive by
          <input
            type="time"
            name="arrivalTime"
            required
            defaultValue={formatArrivalInput(
              target?.arrivalMinutes ?? DEFAULT_ARRIVAL_MINUTES,
            )}
            className={inputClass}
          />
        </label>
        <WeekdayChecklistFields days={days} />
        <div className="block text-sm">
          Place
          <div className="mt-1">
            <PlacePickerMap
              latitude={latitude}
              longitude={longitude}
              radiusMeters={radiusForMap}
              onChange={(nextLatitude, nextLongitude) => {
                setLatitude(nextLatitude);
                setLongitude(nextLongitude);
              }}
            />
          </div>
        </div>
        <input type="hidden" name="latitude" value={latitude} />
        <input type="hidden" name="longitude" value={longitude} />
        <label className="block text-sm">
          Radius (meters)
          <input
            type="number"
            name="radiusMeters"
            required
            min="1"
            max={MAX_RADIUS_METERS}
            step="1"
            value={radiusMeters}
            onChange={(event) => setRadiusMeters(event.target.value)}
            className={inputClass}
          />
        </label>
        <FieldMessage state={state} />
        <button type="submit" disabled={pending} className={`${primaryButtonClass} mt-auto`}>
          {pending ? "Saving…" : target ? "Save target" : "Add target"}
        </button>
      </form>
      {target ? (
        <ConfirmForm
          action={deleteWorkArrivalTarget}
          hidden={{ groupId, targetId: target.id }}
          confirmMessage="Delete this arrival target?"
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
}: {
  groupId: string;
  groupMemberId: string;
  override?: WorkArrivalOverrideView;
  timeZones: string[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(saveWorkArrivalOverride, {});

  return (
    <div className="flex min-w-0 flex-col space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <form action={action} className="flex min-w-0 flex-1 flex-col space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="groupMemberId" value={groupMemberId} />
        {override ? <input type="hidden" name="overrideId" value={override.id} /> : null}
        <p className="text-sm font-medium">
          {override ? "Work day override" : "Add a work day override"}
        </p>
        <label className="block text-sm">
          Work day
          <input
            type="date"
            name="date"
            required
            defaultValue={override?.date ?? defaultDate}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Timezone
          <TimeZoneSelect
            name="timezone"
            defaultValue={override?.timezone ?? DEFAULT_TIMEZONE}
            timeZones={timeZones}
          />
        </label>
        <label className="block text-sm">
          Arrive by
          <input
            type="time"
            name="arrivalTime"
            required
            defaultValue={formatArrivalInput(
              override?.arrivalMinutes ?? DEFAULT_ARRIVAL_MINUTES,
            )}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Note <span className="text-neutral-500">(optional)</span>
          <input name="note" defaultValue={override?.note ?? ""} className={inputClass} />
        </label>
        <FieldMessage state={state} />
        <button type="submit" disabled={pending} className={`${primaryButtonClass} mt-auto`}>
          {pending ? "Saving…" : override ? "Save override" : "Add override"}
        </button>
      </form>
      {override ? (
        <ConfirmForm
          action={deleteWorkArrivalOverride}
          hidden={{ groupId, overrideId: override.id }}
          confirmMessage="Delete this work day override?"
          className={deleteButtonClass}
        >
          Delete
        </ConfirmForm>
      ) : null}
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
  penalty?: WorkArrivalPenaltyView;
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(saveWorkArrivalPenalty, {});
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
        </label>
        <label className="block text-sm">
          Amount per block
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
          Block (minutes)
          <input
            type="number"
            name="blockMinutes"
            required
            min="1"
            max="1440"
            step="1"
            defaultValue={penalty?.blockMinutes ?? DEFAULT_BLOCK_MINUTES}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Payment cap
          <input
            type="number"
            name="cap"
            required
            min="0"
            step="0.01"
            defaultValue={penalty?.cap ?? "10"}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-neutral-500">
            The most one counted work day can owe. A missing or out-of-range
            check-in owes this amount.
          </span>
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
        <FieldMessage state={state} />
        <button type="submit" disabled={pending} className={`${primaryButtonClass} mt-auto`}>
          {pending ? "Saving…" : penalty ? "Save penalty" : "Add penalty"}
        </button>
      </form>
      {penalty ? (
        <ConfirmForm
          action={deleteWorkArrivalPenalty}
          hidden={{ groupId, penaltyId: penalty.id }}
          confirmMessage="Delete this arrival penalty?"
          className={deleteButtonClass}
        >
          Delete
        </ConfirmForm>
      ) : null}
    </div>
  );
}

function targetDetail(member: WorkArrivalMemberView, onDate: string): string | undefined {
  return datedDetail(member.targets, onDate, (entry) => {
    return `${formatArrivalMinutes(entry.arrivalMinutes)} · ${countedDays(entry.days)}`;
  });
}

function penaltyDetail(member: WorkArrivalMemberView, onDate: string): string | undefined {
  return datedDetail(member.penalties, onDate, (entry) => {
    const rate = formatPenaltyRate(entry.amount, entry.unit, entry.unitLabel);
    const cap = formatPenaltyRate(entry.cap, entry.unit, entry.unitLabel);
    return `${rate} / ${entry.blockMinutes} min · cap ${cap}`;
  });
}

function memberMeta(member: WorkArrivalMemberView, onDate: string): string {
  return [
    memberIdentity(member),
    targetDetail(member, onDate) ?? "No target",
    penaltyDetail(member, onDate) ?? "No penalty",
  ].join(" · ");
}

function MemberArrivalCard({
  groupId,
  member,
  timeZones,
  defaultDate,
}: {
  groupId: string;
  member: WorkArrivalMemberView;
  timeZones: string[];
  defaultDate: string;
}) {
  return (
    <SettingsDisclosure
      title={member.displayName}
      meta={memberMeta(member, defaultDate)}
      tone="member"
    >
      <div className="space-y-3">
        <SettingsDisclosure
          title="Arrival targets"
          meta={sectionMeta(
            member.targets.length,
            "target",
            targetDetail(member, defaultDate),
          )}
          heading="h4"
          tone="section"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {member.targets.map((entry) => (
              <TargetForm
                key={entry.id}
                groupId={groupId}
                groupMemberId={member.id}
                target={entry}
                timeZones={timeZones}
                defaultDate={defaultDate}
              />
            ))}
            <TargetForm
              key={`new-target-${member.targets.map((entry) => entry.id).join(",")}`}
              groupId={groupId}
              groupMemberId={member.id}
              timeZones={timeZones}
              defaultDate={defaultDate}
            />
          </div>
        </SettingsDisclosure>
        <SettingsDisclosure
          title="Work day overrides"
          meta={countPhrase(member.overrides.length, "override")}
          heading="h4"
          tone="section"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {member.overrides.map((entry) => (
              <OverrideForm
                key={entry.id}
                groupId={groupId}
                groupMemberId={member.id}
                override={entry}
                timeZones={timeZones}
                defaultDate={defaultDate}
              />
            ))}
            <OverrideForm
              key={`new-override-${member.overrides.map((entry) => entry.id).join(",")}`}
              groupId={groupId}
              groupMemberId={member.id}
              timeZones={timeZones}
              defaultDate={defaultDate}
            />
          </div>
        </SettingsDisclosure>
        <SettingsDisclosure
          title="Late arrival penalty"
          meta={sectionMeta(
            member.penalties.length,
            "penalty",
            penaltyDetail(member, defaultDate),
          )}
          heading="h4"
          tone="section"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {member.penalties.map((entry) => (
              <PenaltyForm
                key={entry.id}
                groupId={groupId}
                groupMemberId={member.id}
                penalty={entry}
                defaultDate={defaultDate}
              />
            ))}
            <PenaltyForm
              key={`new-penalty-${member.penalties.map((entry) => entry.id).join(",")}`}
              groupId={groupId}
              groupMemberId={member.id}
              defaultDate={defaultDate}
            />
          </div>
        </SettingsDisclosure>
      </div>
    </SettingsDisclosure>
  );
}

export function WorkArrivalSettings({
  groupId,
  members,
  timeZones,
  defaultDate,
}: {
  groupId: string;
  members: WorkArrivalMemberView[];
  timeZones: string[];
  defaultDate: string;
}) {
  return (
    <div className="mt-4">
      <SettingsDisclosure
        title="Work arrival time"
        meta={countPhrase(members.length, "member")}
        heading="h3"
      >
        <div className="space-y-3">
          {members.map((member) => (
            <MemberArrivalCard
              key={member.id}
              groupId={groupId}
              member={member}
              timeZones={timeZones}
              defaultDate={defaultDate}
            />
          ))}
        </div>
      </SettingsDisclosure>
    </div>
  );
}
