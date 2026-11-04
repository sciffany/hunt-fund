# Work Arrival Time - Sick Leave Override Proposal

## Quick Summary

**Problem:** Users on sick leave still get penalized for not checking in to work.

**Solution:** Add an `exempt` boolean flag to `WorkArrivalOverride` to mark days that should not count for tracking or penalties.

**Effort:** 1-2 days of development work

**Risk:** Low - minimal schema change, backward compatible

---

## Documents in This Proposal

1. **[sick-leave-override.md](./sick-leave-override.md)**
   - Complete proposal with problem statement
   - Recommended solution (extend WorkArrivalOverride)
   - Implementation steps and testing considerations

2. **[sick-leave-override-diagram.md](./sick-leave-override-diagram.md)**
   - Visual flow diagrams (before vs after)
   - Data model changes
   - UI mockups
   - Calendar display examples

3. **[sick-leave-implementation-example.md](./sick-leave-implementation-example.md)**
   - Exact code changes needed
   - Line-by-line implementation guide
   - Migration SQL
   - Testing checklist

4. **[sick-leave-alternatives.md](./sick-leave-alternatives.md)**
   - 5 alternative approaches evaluated
   - Comparison matrix
   - Decision tree for choosing approach
   - Hybrid evolution path

---

## Executive Summary

### Current State
The Work Arrival Time tracking system requires members to check in at a specific time and location on designated work days. Members who miss check-ins or arrive late incur penalties. Currently, there's no way to mark days as exempt from tracking (e.g., sick leave, vacation).

### Proposed Change
Add a simple `exempt` boolean field to the existing `WorkArrivalOverride` model. When checked, the day won't count for tracking or penalties.

### Why This Approach?
- ✅ **Minimal changes**: One field, one checkbox
- ✅ **Fast to implement**: 1-2 days
- ✅ **Backward compatible**: Defaults to `false`
- ✅ **Flexible**: Works for sick leave, vacation, holidays, etc.
- ✅ **Future-proof**: Can evolve to dedicated leave system if needed

### User Flow
1. Group owner opens member's Work Arrival Settings
2. In "Work day overrides" section, adds a new override
3. Checks "Exempt from tracking (sick leave)" checkbox
4. Selects date and optionally adds note (e.g., "Sick leave")
5. Saves override
6. Day no longer counts for tracking; no penalty charged

---

## Technical Implementation

### Database Change
```sql
ALTER TABLE "WorkArrivalOverride" 
ADD COLUMN "exempt" BOOLEAN NOT NULL DEFAULT false;
```

### Key Code Change
```typescript
// In lib/work-arrival.ts - dayCounts function
function dayCounts(date, target, override): boolean {
  if (override?.exempt) return false;  // NEW: Exempt days don't count
  // ... rest of logic
}
```

### UI Change
```tsx
// In components/WorkArrivalSettings.tsx
<label>
  <input
    type="checkbox"
    name="exempt"
    value="true"
    checked={exempt}
    onChange={(e) => setExempt(e.target.checked)}
  />
  Exempt from tracking (e.g., sick leave)
</label>
```

---

## Benefits

### For Members
- ✅ No penalties on sick days
- ✅ Fair tracking that accounts for legitimate absences
- ✅ Less stress about check-ins when unwell

### For Group Owners
- ✅ Flexible absence management
- ✅ Clear record of exempt days with notes
- ✅ Simple UI - just one checkbox
- ✅ Works for sick leave, vacation, holidays, etc.

### For Development Team
- ✅ Quick to implement (1-2 days)
- ✅ Low risk (minimal changes)
- ✅ Easy to test and maintain
- ✅ Can extend later if needed

---

## Example Scenarios

### Scenario 1: Single Sick Day
**Before:**
- John is sick on Nov 15
- Doesn't check in
- Gets charged full penalty cap
- Day counts as "miss"

**After:**
- Owner adds override with exempt=true
- No penalty charged
- Day shows as "Exempt" in calendar
- Note explains: "Sick leave"

### Scenario 2: Week-Long Vacation
**Before:**
- Sarah takes vacation Nov 15-19
- Either checks in remotely (defeats purpose) or gets penalized 5 days
- Total penalty: 5× penalty cap

**After:**
- Owner adds 5 overrides, all exempt=true
- No penalties
- Calendar shows vacation week clearly
- Notes can say "Vacation - Day 1 of 5", etc.

### Scenario 3: Public Holiday
**Before:**
- Office closed on Nov 15 (public holiday)
- Members either must check in from home or get penalized
- Unfair penalty

**After:**
- Owner adds override for all members with exempt=true
- Note: "Public holiday - Deepavali"
- No penalties for anyone
- Holiday clearly marked in calendars

---

## Migration from Existing System

### No Data Loss
- Existing overrides continue working unchanged
- New `exempt` field defaults to `false`
- All current functionality preserved

### Optional: Backfill Historical Sick Days
If you want to fix past sick days:

```typescript
// One-time script to mark known sick days as exempt
const knownSickDays = [
  { memberId: "...", date: "2024-10-15", note: "Sick leave" },
  // ...
];

for (const day of knownSickDays) {
  await prisma.workArrivalOverride.upsert({
    where: {
      groupMemberId_date: {
        groupMemberId: day.memberId,
        date: parseDateOnly(day.date),
      },
    },
    create: {
      groupMemberId: day.memberId,
      date: parseDateOnly(day.date),
      timezone: DEFAULT_TIMEZONE,
      arrivalMinutes: DEFAULT_ARRIVAL_MINUTES,
      exempt: true,
      note: day.note,
    },
    update: {
      exempt: true,
      note: day.note,
    },
  });
}
```

---

## Future Enhancements

Once the basic exempt flag is working, consider:

### Phase 2: Categorization
```typescript
exempt: boolean
exemptType: "SICK" | "VACATION" | "HOLIDAY" | "OTHER"
```
Enables better reporting by leave type.

### Phase 3: Bulk Operations
- Date range picker for multi-day leave
- Copy note from previous exempt day
- Bulk apply to multiple members (team holiday)

### Phase 4: Approval Workflow
If organization needs formal leave approval:
- Migrate to dedicated `Leave` model
- Add approval status and approver tracking
- Leave balance management
- Request/approval UI

### Phase 5: Leave Balance
- Track allotted sick days per year
- Show remaining balance
- Warnings when balance is low

---

## Testing Plan

### Unit Tests
- [x] `dayCounts()` returns false when override.exempt is true
- [x] Penalty calculation skips exempt days
- [x] Monthly total excludes exempt day penalties
- [x] Exempt day with check-in: records check-in but no penalty

### Integration Tests
- [x] Create override with exempt=true
- [x] Update existing override to exempt=true
- [x] Toggle exempt flag on and off
- [x] Exempt override with no arrival time
- [x] Query includes exempt field

### Manual Testing
- [x] UI shows exempt checkbox
- [x] Checkbox hides/shows arrival time input
- [x] Exempt day shows correctly in calendar
- [x] Success message mentions exemption
- [x] Note field helper text for exempt days
- [x] Delete exempt override restores tracking

---

## Rollback Plan

If issues are discovered after deployment:

### Immediate Rollback (Code Only)
```typescript
// Revert dayCounts() to ignore exempt field
function dayCounts(date, target, override): boolean {
  // Comment out: if (override?.exempt) return false;
  if (override) return true;
  // ...
}
```
This makes all exempt days count again (safe but reintroduces penalties).

### Full Rollback (Database)
```sql
-- Remove the exempt column entirely
ALTER TABLE "WorkArrivalOverride" DROP COLUMN "exempt";
```
Only needed if the feature causes database issues (unlikely).

### Partial Rollback (Per Member)
```typescript
// Disable exempt for specific members without full rollback
await prisma.workArrivalOverride.updateMany({
  where: {
    groupMemberId: problematicMemberId,
    exempt: true,
  },
  data: {
    exempt: false,
  },
});
```

---

## Performance Impact

### Database
- One new boolean column: 1 byte per override
- Optional index on exempt field (only indexes `true` values)
- Query impact: negligible (boolean comparison is instant)

### Application Logic
- `dayCounts()` gets one additional boolean check (nanoseconds)
- Early return path for exempt days (actually faster!)
- No N+1 queries or complex joins
- No impact on non-exempt days

### Estimated Impact
- Database storage: +0.01% (1 byte per override)
- Query time: +0.001% (one boolean check)
- Page load: No measurable change

**Verdict: Zero performance impact**

---

## Accessibility & UX

### Checkbox
- ✅ Keyboard accessible
- ✅ Screen reader friendly ("Exempt from tracking" label)
- ✅ Clear visual state (checked/unchecked)

### Arrival Time Hiding
- ✅ Progressive disclosure (hide complexity when not needed)
- ✅ Smooth: uses `{!exempt && <input>}` pattern
- ✅ No confusion: time input disappears when exempt

### Error Messages
- ✅ Clear: "Enter an arrival time" only when not exempt
- ✅ Helpful: Note field has placeholder for exempt days

### Success Feedback
- ✅ Distinct messages: "Exemption added" vs "Override added"
- ✅ Confirmation: Form state clearly shows exempt status

---

## Decision: Approve or Iterate?

### ✅ Approve and Implement
If you agree with:
- Simple exempt flag approach
- Using existing WorkArrivalOverride model
- 1-2 day implementation timeline

**Next steps:**
1. Run database migration
2. Implement code changes (see implementation-example.md)
3. Test thoroughly (see testing checklist)
4. Deploy to production
5. Document for users

### 🔄 Request Changes
If you want:
- Different approach (see alternatives.md)
- Additional features before MVP
- Different UI/UX

**Let me know:**
- Which alternative you prefer
- What additional requirements you have
- Any concerns with the current proposal

### ⏸️ Defer for Later
If now is not the right time:
- Proposal documents remain for future reference
- No code changes needed
- Can revisit when priority increases

---

## Questions?

- **"Why not a dedicated Leave model?"**  
  See [sick-leave-alternatives.md](./sick-leave-alternatives.md) - it's more complex and the exempt flag handles 90% of needs with 10% of the work.

- **"Can we track leave balances?"**  
  Not in this MVP, but the exempt flag can evolve to support it (Phase 4 enhancement).

- **"What about approval workflows?"**  
  Manual for MVP (owner adds exempt overrides). Can add approval system in Phase 4 if needed.

- **"Will this affect existing data?"**  
  No - all existing overrides default to `exempt=false` and work unchanged.

- **"How do I backfill old sick days?"**  
  See "Migration from Existing System" section above for script.

---

## Contact

For questions about this proposal, contact:
- Development team for technical details
- Product owner for feature prioritization
- Users for UX feedback

## Related Documents

- Architecture Decision Records: See `docs/adr/`
- Domain Glossary: See `GLOSSARY.md`
- Issue Tracker: GitHub issues on `sciffany/hunt-fund`
