# Proposal: Sick Leave Override for Work Arrival Time

## Problem Statement

Currently, when a user is on sick leave, their work arrival time is still tracked and they may incur penalties for missing check-ins on days they are legitimately unable to come to work. There is no way to mark certain days as "excused" or exempt from tracking and penalties.

## Current System Overview

The Work Arrival Time tracking system consists of:

1. **WorkArrivalTarget** - Defines when a member should arrive at work (time, location, weekdays that count)
2. **WorkArrivalOverride** - Allows one-off changes to arrival time for specific work days
3. **WorkArrivalPenalty** - Defines penalty rates for late or missing check-ins
4. **WorkArrivalDay** - Records actual check-in times and locations

Currently, `WorkArrivalOverride` only allows changing the **arrival time** for a specific day - it doesn't allow exempting a day from tracking entirely.

## Proposed Solution

### Option 1: Extend WorkArrivalOverride with Exemption Flag (Recommended)

Add an optional `exempt` boolean field to the `WorkArrivalOverride` model to mark days that should not count for tracking or penalties.

#### Database Schema Changes

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
}
```

#### Migration

```sql
-- Add exempt column with default false
ALTER TABLE "WorkArrivalOverride" ADD COLUMN "exempt" BOOLEAN NOT NULL DEFAULT false;
```

#### Logic Changes

**In `lib/work-arrival.ts`:**

1. Update type definitions:
```typescript
export type WorkArrivalOverrideForCharge = {
  date: string;
  timezone: string;
  arrivalMinutes: number;
  exempt?: boolean; // New field
};
```

2. Modify `dayCounts()` to check exempt flag:
```typescript
function dayCounts(
  date: string,
  target: WorkArrivalTargetForCharge | undefined,
  override: WorkArrivalOverrideForCharge | undefined,
): boolean {
  if (override?.exempt) return false; // Exempt days don't count
  if (override) return true;
  if (!target) return false;
  return target.days[weekdayOfDate(date)];
}
```

**In `lib/actions/work-arrival.ts`:**

1. Update `saveWorkArrivalOverride()` to handle the exempt flag:
```typescript
export async function saveWorkArrivalOverride(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // ... existing validation ...
  
  const exempt = formData.get("exempt") === "true";
  
  // When exempt is true, arrival time is optional
  const arrivalMinutes = exempt 
    ? DEFAULT_ARRIVAL_MINUTES 
    : parseArrivalMinutes(formData.get("arrivalTime"));
  
  if (!exempt && arrivalMinutes === null) {
    return { error: "Enter an arrival time." };
  }

  const data = { date, timezone, arrivalMinutes, note, exempt };
  
  // ... rest of save logic ...
}
```

**In `components/WorkArrivalSettings.tsx`:**

1. Update `WorkArrivalOverrideView` type:
```typescript
export type WorkArrivalOverrideView = {
  id: string;
  date: string;
  timezone: string;
  arrivalMinutes: number;
  note: string | null;
  exempt: boolean; // New field
};
```

2. Modify `OverrideForm` component to include exempt checkbox:
```typescript
function OverrideForm({ ... }) {
  const [state, action, pending] = useActionState(saveWorkArrivalOverride, {});
  const [exempt, setExempt] = useState(override?.exempt ?? false);

  return (
    <div className="...">
      <form action={action} className="...">
        {/* ... existing hidden inputs ... */}
        
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="exempt"
            value="true"
            checked={exempt}
            onChange={(e) => setExempt(e.target.checked)}
          />
          <span>Exempt from tracking (e.g., sick leave)</span>
        </label>
        
        {/* Only show arrival time input when not exempt */}
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
          <input name="note" defaultValue={override?.note ?? ""} className={inputClass} />
          <span className="mt-1 block text-xs text-neutral-500">
            For sick leave, you might note "Sick leave" or "Medical leave"
          </span>
        </label>
        
        {/* ... rest of form ... */}
      </form>
    </div>
  );
}
```

#### User Experience

1. **Adding Sick Leave Override:**
   - Group owner navigates to Work Arrival Settings for a member
   - In "Work day overrides" section, clicks to add a new override
   - Checks "Exempt from tracking" checkbox
   - Selects the date of sick leave
   - Optionally adds note like "Sick leave"
   - Saves the override

2. **Effect on Tracking:**
   - The day will show in the member's calendar with a note indicating it's exempt
   - No penalty will be charged for that day
   - The day won't count toward total work days tracked
   - If user checks in anyway, it's recorded but doesn't affect penalties

3. **Display:**
   - In the group page calendar view, exempt days could show with a special indicator (e.g., grayed out or with a different icon)
   - The note would explain why the day is exempt

### Option 2: Create Separate SickLeaveDay Model

Create a dedicated model for sick leave days.

#### Pros:
- Clearer separation of concerns
- Can add sick-leave-specific metadata (medical certificate, approval status, etc.)
- Easier to query and report on sick leave patterns

#### Cons:
- More complex implementation
- Two systems that do similar things (marking days as special)
- More UI complexity (another section in settings)

---

## Recommendation

**I recommend Option 1** (Extend WorkArrivalOverride) because:

1. **Simpler Implementation** - Reuses existing override infrastructure
2. **Natural Fit** - Sick leave is conceptually an override of the normal tracking rules
3. **Flexible** - The `exempt` flag can be used for other types of excused absences (vacation, public holidays, etc.)
4. **Backward Compatible** - Existing overrides continue to work unchanged (default `exempt=false`)
5. **Less UI Clutter** - No new section needed; just adds one checkbox to existing form

## Implementation Steps

1. Create and run database migration to add `exempt` column
2. Update Prisma schema
3. Modify types in `lib/work-arrival.ts`
4. Update `dayCounts()` logic to respect exempt flag
5. Modify `saveWorkArrivalOverride()` action to handle exempt flag
6. Update `WorkArrivalOverrideView` type and form component UI
7. Add tests for exempt day logic
8. Update any display components to show exempt days appropriately

## Testing Considerations

1. Test that exempt days don't incur penalties
2. Test that exempt days don't count in work day totals
3. Test that check-ins on exempt days are still recorded but ignored for penalties
4. Test that you can convert a regular override to exempt and vice versa
5. Test that note field works well with exempt flag for documentation

## Future Enhancements

- Bulk actions to mark multiple consecutive days as exempt (sick leave period)
- Different exemption types (sick leave, vacation, public holiday, etc.)
- Approval workflow for sick leave requests
- Integration with calendar systems to automatically detect holidays
- Statistics/reports on leave patterns
