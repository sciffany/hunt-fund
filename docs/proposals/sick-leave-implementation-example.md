# Sick Leave Override - Implementation Code Examples

This document shows the exact code changes needed to implement the sick leave override feature.

## 1. Database Migration

**File:** `app/prisma/migrations/20241104000000_add_exempt_to_work_arrival_override/migration.sql`

```sql
-- Add exempt column to WorkArrivalOverride table
-- When true, the day is exempt from tracking and penalties (e.g., sick leave)
ALTER TABLE "WorkArrivalOverride" 
ADD COLUMN "exempt" BOOLEAN NOT NULL DEFAULT false;

-- Add index for querying exempt days
CREATE INDEX "WorkArrivalOverride_exempt_idx" 
ON "WorkArrivalOverride"("exempt") 
WHERE "exempt" = true;
```

## 2. Prisma Schema Update

**File:** `app/prisma/schema.prisma`

```prisma
model WorkArrivalOverride {
  id             String      @id @default(cuid())
  groupMemberId  String
  groupMember    GroupMember @relation(fields: [groupMemberId], references: [id], onDelete: Cascade)
  /// Work-day calendar date this one-off arrival time applies to.
  date           DateTime    @db.Date
  timezone       String
  /// Minutes from local midnight, 0–1439.
  arrivalMinutes Int
  note           String?
  /// When true, this day is exempt from tracking and penalties (e.g., sick leave).
  exempt         Boolean     @default(false)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@unique([groupMemberId, date])
  @@index([exempt], where: { exempt: true })
}
```

## 3. Type Definitions Update

**File:** `app/lib/work-arrival.ts`

```typescript
// Update the type definition to include exempt field
export type WorkArrivalOverrideForCharge = {
  date: string;
  timezone: string;
  arrivalMinutes: number;
  exempt?: boolean; // NEW: When true, day doesn't count for tracking
};
```

## 4. Logic Update - dayCounts Function

**File:** `app/lib/work-arrival.ts`

```typescript
// BEFORE
function dayCounts(
  date: string,
  target: WorkArrivalTargetForCharge | undefined,
  override: WorkArrivalOverrideForCharge | undefined,
): boolean {
  if (override) return true;
  if (!target) return false;
  return target.days[weekdayOfDate(date)];
}

// AFTER
function dayCounts(
  date: string,
  target: WorkArrivalTargetForCharge | undefined,
  override: WorkArrivalOverrideForCharge | undefined,
): boolean {
  // NEW: Exempt overrides don't count as work days
  if (override?.exempt) return false;
  
  if (override) return true;
  if (!target) return false;
  return target.days[weekdayOfDate(date)];
}
```

## 5. Server Action Update

**File:** `app/lib/actions/work-arrival.ts`

```typescript
export async function saveWorkArrivalOverride(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const groupMemberId = String(formData.get("groupMemberId") ?? "");
  const overrideId = String(formData.get("overrideId") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  
  // NEW: Get exempt flag from form
  const exempt = formData.get("exempt") === "true";

  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return { error: "You can't edit this group." };

  const member = await prisma.groupMember.findUnique({
    where: { id: groupMemberId },
  });
  if (!member || member.groupId !== groupId) {
    return { error: "That member isn't in this group." };
  }

  const date = parseDateOnly(String(formData.get("date") ?? ""));
  if (!date) return { error: "Enter a valid work day." };
  if (!isValidTimeZone(timezone)) return { error: "Choose a valid timezone." };

  // MODIFIED: Arrival time is only required when not exempt
  let arrivalMinutes: number | null;
  if (exempt) {
    // For exempt days, use default time (it won't be used in calculations)
    arrivalMinutes = DEFAULT_ARRIVAL_MINUTES;
  } else {
    arrivalMinutes = parseArrivalMinutes(formData.get("arrivalTime"));
    if (arrivalMinutes === null) return { error: "Enter an arrival time." };
  }

  // NEW: Include exempt in data
  const data = { date, timezone, arrivalMinutes, note, exempt };

  try {
    if (overrideId) {
      const existing = await prisma.workArrivalOverride.findUnique({
        where: { id: overrideId },
      });
      if (!existing || existing.groupMemberId !== groupMemberId) {
        return { error: "That override wasn't found." };
      }
      await prisma.workArrivalOverride.update({ where: { id: overrideId }, data });
    } else {
      await prisma.workArrivalOverride.create({
        data: { groupMemberId, ...data },
      });
    }
  } catch (error) {
    if (uniqueConstraintError(error)) {
      return { error: "This member already has an override on that date." };
    }
    throw error;
  }

  revalidateGroup(groupId);
  
  // MODIFIED: Success message mentions exemption
  const successMsg = exempt
    ? overrideId ? "Exemption saved." : "Exemption added."
    : overrideId ? "Override saved." : "Override added.";
  
  return { success: successMsg };
}
```

## 6. Component Type Update

**File:** `app/components/WorkArrivalSettings.tsx`

```typescript
// Update the view type
export type WorkArrivalOverrideView = {
  id: string;
  date: string;
  timezone: string;
  arrivalMinutes: number;
  note: string | null;
  exempt: boolean; // NEW
};
```

## 7. UI Form Component Update

**File:** `app/components/WorkArrivalSettings.tsx`

```typescript
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
  // NEW: Track exempt state
  const [exempt, setExempt] = useState(override?.exempt ?? false);

  return (
    <div className="flex min-w-0 flex-col space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <form action={action} className="flex min-w-0 flex-1 flex-col space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="groupMemberId" value={groupMemberId} />
        {override ? <input type="hidden" name="overrideId" value={override.id} /> : null}
        
        <p className="text-sm font-medium">
          {override ? "Work day override" : "Add a work day override"}
        </p>
        
        {/* NEW: Exempt checkbox */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="exempt"
            value="true"
            checked={exempt}
            onChange={(e) => setExempt(e.target.checked)}
            className="rounded"
          />
          <span>Exempt from tracking (e.g., sick leave, vacation)</span>
        </label>
        
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
        
        {/* MODIFIED: Only show arrival time when not exempt */}
        {!exempt && (
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
        )}
        
        <label className="block text-sm">
          Note <span className="text-neutral-500">(optional)</span>
          <input 
            name="note" 
            defaultValue={override?.note ?? ""} 
            className={inputClass}
            placeholder={exempt ? "e.g., Sick leave, Medical appointment" : ""}
          />
          {/* NEW: Helper text for exempt days */}
          {exempt && (
            <span className="mt-1 block text-xs text-neutral-500">
              Document the reason for exemption (sick leave, vacation, etc.)
            </span>
          )}
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
```

## 8. Page Query Update

**File:** `app/app/groups/[id]/settings/page.tsx`

When querying overrides, ensure the `exempt` field is included:

```typescript
// In the page component where overrides are fetched
const overrides = await prisma.workArrivalOverride.findMany({
  where: { groupMemberId: member.id },
  select: {
    id: true,
    date: true,
    timezone: true,
    arrivalMinutes: true,
    note: true,
    exempt: true, // NEW: Include exempt field
  },
  orderBy: { date: "desc" },
});
```

## 9. Display Page Update

**File:** `app/app/groups/[id]/page.tsx`

Update the query to include the exempt field in calculations:

```typescript
// When building overrides for charge calculation
const overrides = member.workArrivalOverrides.map((override) => ({
  date: formatDateOnly(override.date),
  timezone: override.timezone,
  arrivalMinutes: override.arrivalMinutes,
  exempt: override.exempt, // NEW: Pass exempt flag to charge calculation
}));
```

## 10. Optional: Display Enhancement

**File:** `app/components/WorkArrivalCalendar.tsx` (if it exists) or in the page component

Add visual indication for exempt days:

```typescript
function DayCell({ date, cell, isExempt }: {
  date: string;
  cell: WorkArrivalChargeCell;
  isExempt?: boolean;
}) {
  // Visual styling for exempt days
  const cellClass = isExempt
    ? "bg-neutral-100 text-neutral-400" // Grayed out for exempt days
    : cell.miss
    ? "bg-red-50 text-red-700"
    : cell.late
    ? "bg-yellow-50 text-yellow-700"
    : "bg-green-50 text-green-700";
  
  return (
    <div className={`p-2 ${cellClass}`}>
      {isExempt && (
        <span className="text-xs font-medium">EXEMPT</span>
      )}
      {cell.time && <span>{cell.time}</span>}
      {cell.charge && <span>{cell.charge}</span>}
    </div>
  );
}
```

## Testing Checklist

After implementing these changes, test:

```typescript
// Test cases to verify

// 1. Create exempt override
// Expected: Day doesn't count, no penalty

// 2. Create exempt override with no arrival time
// Expected: Saves successfully with default time

// 3. Check in on exempt day
// Expected: Check-in recorded but no penalty calculated

// 4. Toggle exempt flag on existing override
// Expected: Penalty appears/disappears correctly

// 5. Query overrides with exempt flag
// Expected: Exempt field is present and correct

// 6. Display calendar with exempt days
// Expected: Exempt days show appropriate visual indicator

// 7. Calculate monthly total with exempt days
// Expected: Exempt days not included in penalty total

// 8. Exempt day on weekend
// Expected: Works correctly (weekend + exempt = still exempt)

// 9. Delete exempt override
// Expected: Day returns to normal tracking rules
```

## Rollback Plan

If issues arise, rollback is simple:

```sql
-- Remove the exempt column
ALTER TABLE "WorkArrivalOverride" DROP COLUMN "exempt";

-- Remove the index
DROP INDEX IF EXISTS "WorkArrivalOverride_exempt_idx";
```

Then revert the code changes and redeploy.

## Performance Considerations

The exempt flag is:
- Indexed for efficient queries
- Boolean type (1 byte, minimal storage)
- Default false (no impact on existing data)
- Checked early in dayCounts() (fast exit path)

No significant performance impact expected.
