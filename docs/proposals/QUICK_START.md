# Quick Start: Implementing Sick Leave Override

> **TL;DR:** Add `exempt: boolean` to `WorkArrivalOverride`. When true, day doesn't count for penalties.

## 1. Run Migration (2 min)

```bash
cd app
npx prisma migrate dev --name add_exempt_to_work_arrival_override
```

Migration content:
```sql
ALTER TABLE "WorkArrivalOverride" ADD COLUMN "exempt" BOOLEAN NOT NULL DEFAULT false;
```

## 2. Update Schema (1 min)

In `app/prisma/schema.prisma`:
```prisma
model WorkArrivalOverride {
  // ... existing fields ...
  exempt         Boolean     @default(false)
  // ... rest ...
}
```

## 3. Update Type (1 min)

In `app/lib/work-arrival.ts`:
```typescript
export type WorkArrivalOverrideForCharge = {
  date: string;
  timezone: string;
  arrivalMinutes: number;
  exempt?: boolean; // ADD THIS
};
```

## 4. Update Logic (2 min)

In `app/lib/work-arrival.ts`, modify `dayCounts()`:
```typescript
function dayCounts(
  date: string,
  target: WorkArrivalTargetForCharge | undefined,
  override: WorkArrivalOverrideForCharge | undefined,
): boolean {
  if (override?.exempt) return false; // ADD THIS LINE
  if (override) return true;
  if (!target) return false;
  return target.days[weekdayOfDate(date)];
}
```

## 5. Update Action (10 min)

In `app/lib/actions/work-arrival.ts`, modify `saveWorkArrivalOverride()`:

```typescript
export async function saveWorkArrivalOverride(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // ... existing code ...
  
  // ADD: Get exempt flag
  const exempt = formData.get("exempt") === "true";
  
  // MODIFY: Arrival time optional when exempt
  let arrivalMinutes: number | null;
  if (exempt) {
    arrivalMinutes = DEFAULT_ARRIVAL_MINUTES;
  } else {
    arrivalMinutes = parseArrivalMinutes(formData.get("arrivalTime"));
    if (arrivalMinutes === null) return { error: "Enter an arrival time." };
  }

  // MODIFY: Include exempt in data
  const data = { date, timezone, arrivalMinutes, note, exempt };

  // ... rest of save logic ...
  
  // MODIFY: Success message
  const successMsg = exempt
    ? overrideId ? "Exemption saved." : "Exemption added."
    : overrideId ? "Override saved." : "Override added.";
  
  return { success: successMsg };
}
```

## 6. Update Component Type (1 min)

In `app/components/WorkArrivalSettings.tsx`:
```typescript
export type WorkArrivalOverrideView = {
  id: string;
  date: string;
  timezone: string;
  arrivalMinutes: number;
  note: string | null;
  exempt: boolean; // ADD THIS
};
```

## 7. Update UI Form (15 min)

In `app/components/WorkArrivalSettings.tsx`, modify `OverrideForm`:

```typescript
function OverrideForm({ groupId, groupMemberId, override, timeZones, defaultDate }) {
  const [state, action, pending] = useActionState(saveWorkArrivalOverride, {});
  const [exempt, setExempt] = useState(override?.exempt ?? false); // ADD THIS

  return (
    <div className="...">
      <form action={action} className="...">
        {/* ... existing hidden inputs ... */}
        
        {/* ADD THIS: Exempt checkbox */}
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
        
        {/* ... date and timezone inputs ... */}
        
        {/* MODIFY: Only show when not exempt */}
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
        
        {/* Note input with updated helper text */}
        <label className="block text-sm">
          Note <span className="text-neutral-500">(optional)</span>
          <input 
            name="note" 
            defaultValue={override?.note ?? ""} 
            className={inputClass}
            placeholder={exempt ? "e.g., Sick leave, Medical appointment" : ""}
          />
          {exempt && (
            <span className="mt-1 block text-xs text-neutral-500">
              Document the reason for exemption
            </span>
          )}
        </label>
        
        {/* ... rest of form ... */}
      </form>
    </div>
  );
}
```

## 8. Update Queries (5 min)

### In `app/app/groups/[id]/settings/page.tsx`:
```typescript
const overrides = await prisma.workArrivalOverride.findMany({
  where: { groupMemberId: member.id },
  select: {
    // ... existing fields ...
    exempt: true, // ADD THIS
  },
});
```

### In `app/app/groups/[id]/page.tsx`:
```typescript
const overrides = member.workArrivalOverrides.map((override) => ({
  date: formatDateOnly(override.date),
  timezone: override.timezone,
  arrivalMinutes: override.arrivalMinutes,
  exempt: override.exempt, // ADD THIS
}));
```

## 9. Test (15 min)

```bash
# Start dev server
cd app
npm run dev

# Manual tests:
# 1. Create override with exempt=true
# 2. Verify arrival time input is hidden
# 3. Save and check calendar shows no penalty
# 4. Toggle exempt off, verify time input appears
# 5. Delete override, verify tracking returns
```

## 10. Deploy

```bash
# Run migrations on production
npx prisma migrate deploy

# Deploy application
# (your deployment process)
```

---

## Total Time: ~45 minutes

- Migration: 2 min
- Schema: 1 min  
- Type: 1 min
- Logic: 2 min
- Action: 10 min
- Component Type: 1 min
- UI Form: 15 min
- Queries: 5 min
- Testing: 15 min

**Plus deployment time**

---

## Verification Checklist

After implementation, verify:

- [x] Migration ran successfully
- [x] Exempt checkbox appears in override form
- [x] Arrival time input hides when exempt checked
- [x] Can save override with exempt=true
- [x] Exempt day shows in calendar (no penalty)
- [x] Check-in on exempt day: recorded but no penalty
- [x] Can toggle exempt on existing override
- [x] Delete exempt override restores tracking
- [x] Note field has helpful placeholder for exempt days
- [x] Success message mentions exemption

---

## Rollback

If needed, revert the `dayCounts()` change:

```typescript
function dayCounts(date, target, override): boolean {
  // Comment out: if (override?.exempt) return false;
  if (override) return true;
  // ...
}
```

Or remove the column entirely:
```sql
ALTER TABLE "WorkArrivalOverride" DROP COLUMN "exempt";
```

---

## Need Help?

See detailed docs:
- **Full proposal**: [sick-leave-override.md](./sick-leave-override.md)
- **Complete code examples**: [sick-leave-implementation-example.md](./sick-leave-implementation-example.md)
- **Visual diagrams**: [sick-leave-override-diagram.md](./sick-leave-override-diagram.md)
- **Alternative approaches**: [sick-leave-alternatives.md](./sick-leave-alternatives.md)
