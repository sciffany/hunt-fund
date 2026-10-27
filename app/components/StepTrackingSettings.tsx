"use client";

import { useActionState, useState } from "react";
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
  deleteStepPenalty,
  deleteStepTarget,
  saveStepPenalty,
  saveStepTarget,
} from "@/lib/actions/steps";
import {
  DEFAULT_PENALTY_AMOUNT,
  formatPenaltyRate,
  MAX_UNIT_LABEL_LENGTH,
  PENALTY_UNITS,
  PENALTY_UNIT_LABELS,
  type PenaltyUnit,
} from "@/lib/penalty";
import { DEFAULT_TARGET_STEPS } from "@/lib/steps";

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500";

const primaryButtonClass =
  "rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60";

const deleteButtonClass =
  "rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50";

export type StepTargetView = {
  id: string;
  effectiveFrom: string;
  targetSteps: number;
};

export type StepPenaltyView = {
  id: string;
  effectiveFrom: string;
  amount: string;
  unit: PenaltyUnit;
  unitLabel: string | null;
};

export type StepMemberView = {
  id: string;
  displayName: string;
  username: string | null;
  role: "OWNER" | "MEMBER";
  pending?: boolean;
  targets: StepTargetView[];
  penalties: StepPenaltyView[];
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

function TargetForm({
  groupId,
  groupMemberId,
  target,
  defaultDate,
}: {
  groupId: string;
  groupMemberId: string;
  target?: StepTargetView;
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(saveStepTarget, {});

  return (
    <div className="flex min-w-0 flex-col space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <form action={action} className="flex min-w-0 flex-1 flex-col space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="groupMemberId" value={groupMemberId} />
        {target ? <input type="hidden" name="targetId" value={target.id} /> : null}

        <p className="text-sm font-medium">
          {target ? "Step target" : "Add a step target"}
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
          <span className="mt-1 block text-xs text-neutral-500">
            Days before this date aren’t covered.
          </span>
        </label>

        <label className="block text-sm">
          Daily step target
          <input
            type="number"
            name="targetSteps"
            required
            min="1"
            max="1000000"
            step="1"
            defaultValue={target?.targetSteps ?? DEFAULT_TARGET_STEPS}
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
          action={deleteStepTarget}
          hidden={{ groupId, targetId: target.id }}
          confirmMessage="Delete this step target?"
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
  penalty?: StepPenaltyView;
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(saveStepPenalty, {});
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
            Days before this date aren’t covered.
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
          Charged per 500 steps below target.
        </p>

        <FieldMessage state={state} />
        <button type="submit" disabled={pending} className={`${primaryButtonClass} mt-auto`}>
          {pending ? "Saving…" : penalty ? "Save penalty" : "Add penalty"}
        </button>
      </form>
      {penalty ? (
        <ConfirmForm
          action={deleteStepPenalty}
          hidden={{ groupId, penaltyId: penalty.id }}
          confirmMessage="Delete this step penalty?"
          className={deleteButtonClass}
        >
          Delete
        </ConfirmForm>
      ) : null}
    </div>
  );
}

function stepTargetDetail(member: StepMemberView, onDate: string): string | undefined {
  return datedDetail(member.targets, onDate, (target) => {
    return `${target.targetSteps.toLocaleString("en-US")} steps`;
  });
}

function stepPenaltyDetail(member: StepMemberView, onDate: string): string | undefined {
  return datedDetail(member.penalties, onDate, (penalty) => {
    return `${formatPenaltyRate(penalty.amount, penalty.unit, penalty.unitLabel)} / 500 steps`;
  });
}

function stepMemberMeta(member: StepMemberView, onDate: string): string {
  return [
    memberIdentity(member),
    stepTargetDetail(member, onDate) ?? "No target",
    stepPenaltyDetail(member, onDate) ?? "No penalty",
  ].join(" · ");
}

function MemberStepCard({
  groupId,
  member,
  defaultDate,
}: {
  groupId: string;
  member: StepMemberView;
  defaultDate: string;
}) {
  return (
    <SettingsDisclosure
      title={member.displayName}
      meta={stepMemberMeta(member, defaultDate)}
      tone="member"
    >
      <div className="space-y-3">
        <SettingsDisclosure
          title="Daily step targets"
          meta={sectionMeta(member.targets.length, "target", stepTargetDetail(member, defaultDate))}
          heading="h4"
          tone="section"
        >
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              Add another period when the target changes. The latest start date on or
              before a day is the one that applies.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {member.targets.map((target) => (
                <TargetForm
                  key={target.id}
                  groupId={groupId}
                  groupMemberId={member.id}
                  target={target}
                  defaultDate={defaultDate}
                />
              ))}
              <TargetForm
                key={`new-target-${member.targets.map((t) => t.id).join(",")}`}
                groupId={groupId}
                groupMemberId={member.id}
                defaultDate={defaultDate}
              />
            </div>
          </div>
        </SettingsDisclosure>

        <SettingsDisclosure
          title="Missed-steps penalty"
          meta={sectionMeta(
            member.penalties.length,
            "penalty",
            stepPenaltyDetail(member, defaultDate),
            "penalties",
          )}
          heading="h4"
          tone="section"
        >
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              Add another period when the rate changes. The latest start date on or
              before a day is the one that applies.
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
        </SettingsDisclosure>
      </div>
    </SettingsDisclosure>
  );
}

export function StepTrackingSettings({
  groupId,
  members,
  defaultDate,
}: {
  groupId: string;
  members: StepMemberView[];
  defaultDate: string;
}) {
  return (
    <div className="mt-4">
      <SettingsDisclosure
        title="Daily step count"
        meta={countPhrase(members.length, "member")}
        heading="h3"
      >
        <div className="space-y-3">
          {members.map((member) => (
            <MemberStepCard
              key={member.id}
              groupId={groupId}
              member={member}
              defaultDate={defaultDate}
            />
          ))}
        </div>
      </SettingsDisclosure>
    </div>
  );
}
