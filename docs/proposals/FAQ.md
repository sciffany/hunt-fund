# Sick Leave Override - Frequently Asked Questions

## General Questions

### Q: What problem does this solve?
**A:** Currently, when a user is on sick leave, they still get penalized for not checking in to work. This feature allows marking specific days as "exempt" from tracking and penalties.

### Q: How does it work?
**A:** Group owners can add a Work Day Override and check the "Exempt from tracking" checkbox. That day will no longer count for tracking or incur penalties.

### Q: Is this just for sick leave?
**A:** No! The exempt flag works for any legitimate absence: sick leave, vacation, public holidays, medical appointments, etc.

---

## Implementation Questions

### Q: How much work is this to implement?
**A:** Approximately 2 hours of development time:
- 1 database field addition
- 1 core logic line change  
- UI form updates
- Testing

See [QUICK_START.md](./QUICK_START.md) for step-by-step guide.

### Q: What's the risk level?
**A:** Very low risk:
- Additive change only (no data modification)
- Defaults to `false` (backward compatible)
- Single boolean check (minimal performance impact)
- Easy to rollback if needed

### Q: Will this break existing functionality?
**A:** No. All existing overrides continue working exactly as before. The new `exempt` field defaults to `false`, so nothing changes unless you explicitly set it to `true`.

### Q: What if we need to rollback?
**A:** Very simple:
```typescript
// Option 1: Comment out the exempt check in code
if (override?.exempt) return false; // Comment this out

// Option 2: Drop the database column
ALTER TABLE "WorkArrivalOverride" DROP COLUMN "exempt";
```

---

## Feature Questions

### Q: Can I exempt multiple days at once?
**A:** In the MVP, you add one override per day. A future enhancement (Phase 3) could add date range selection for multi-day leave.

### Q: Can I still check in on an exempt day?
**A:** Yes! The system will record your check-in, but it won't affect penalties since the day doesn't count.

### Q: What shows in the calendar for exempt days?
**A:** The day appears with no penalty charge. You can optionally add visual indicators (grayed out, special icon) in a future enhancement.

### Q: Can I mark a day as exempt after it's already passed?
**A:** Yes! You can add exempt overrides for past dates to correct historical penalties.

### Q: Can members mark their own days as exempt?
**A:** No, only group owners can add overrides (including exempt ones). This is consistent with the existing override system.

### Q: Can I have both an exempt day and a check-in?
**A:** Yes. If someone checks in on an exempt day, the check-in is recorded but the day doesn't count for penalties.

### Q: What happens to the note field?
**A:** The note field is perfect for documenting why the day is exempt (e.g., "Sick leave", "Vacation - Day 2 of 5", "Medical appointment").

---

## Technical Questions

### Q: What database changes are needed?
**A:** One column addition:
```sql
ALTER TABLE "WorkArrivalOverride" 
ADD COLUMN "exempt" BOOLEAN NOT NULL DEFAULT false;
```

### Q: Will this slow down queries?
**A:** No. A boolean check adds negligible time (~nanoseconds). The early return for exempt days actually makes it slightly faster.

### Q: Do I need to update the Prisma schema?
**A:** Yes, add the field to `WorkArrivalOverride` model:
```prisma
exempt Boolean @default(false)
```

### Q: What about indexes?
**A:** Optional - you can add an index on the `exempt` column for faster queries:
```sql
CREATE INDEX "WorkArrivalOverride_exempt_idx" 
ON "WorkArrivalOverride"("exempt") 
WHERE "exempt" = true;
```
This only indexes the `true` values, keeping it small.

---

## Comparison Questions

### Q: Why not create a separate Leave model?
**A:** A dedicated Leave model is more complex (1-2 weeks work) and adds features most teams don't need yet. The exempt flag solves 90% of needs with 10% of the work. You can always migrate to a full Leave system later if needed.

See [sick-leave-alternatives.md](./sick-leave-alternatives.md) for detailed comparison.

### Q: Why not use JSON to store exempt dates?
**A:** JSON arrays are harder to query, can't have per-day notes, and violate database normalization. The override approach is cleaner and more flexible.

### Q: Can we do negative penalties instead?
**A:** Negative penalties (credits) are conceptually confusing and don't prevent the day from counting in statistics. Exemption is the correct approach.

---

## UI/UX Questions

### Q: Where does the exempt checkbox appear?
**A:** In the "Work day overrides" section of member settings, right in the override form.

### Q: Does the arrival time field still show when exempt?
**A:** No, it's hidden when exempt is checked (progressive disclosure - simpler UX).

### Q: Is the checkbox keyboard accessible?
**A:** Yes, fully keyboard and screen-reader accessible.

### Q: Can I tell which days are exempt in the calendar?
**A:** In the MVP, exempt days show no penalty. A future enhancement could add visual indicators (icon, color, etc.).

---

## Use Case Questions

### Q: How do I handle a week-long vacation?
**A:** Add 5 separate overrides (Mon-Fri), each with exempt checked. Future enhancement could add a date range picker.

### Q: How do I handle a public holiday for the whole team?
**A:** Add an exempt override for each team member on that date. Note could be "Public Holiday - [Name]".

### Q: What if someone is sick for 2 weeks?
**A:** Add 10 exempt overrides (weekdays only). You can document it with notes like "Sick leave - Day 1 of 10", etc.

### Q: Can I exempt a weekend day?
**A:** Yes, though weekends typically don't count anyway (unless set in target days). Exempt overrides work on any date.

### Q: What about half-day medical appointments?
**A:** Two options:
1. Exempt the whole day (no penalty at all)
2. Override with a later arrival time (still tracked, just later)

Choose based on your policy.

---

## Data Questions

### Q: What happens to existing overrides?
**A:** Nothing. They all get `exempt: false` by default and continue working exactly as before.

### Q: Can I see a history of exempt days?
**A:** Yes, all overrides (including exempt ones) are stored permanently with creation timestamps. You can query them anytime.

### Q: Can I export exempt day data?
**A:** The data is in the database, so you can export it with standard database tools or add a reporting feature later.

### Q: Can I bulk import exempt days?
**A:** Not in the MVP. You'd need to either:
1. Add them one by one in the UI
2. Write a one-time script to insert them (see migration example in README.md)

---

## Policy Questions

### Q: Should we require documentation for exempt days?
**A:** That's a policy decision. The system allows but doesn't require notes. You could establish a team policy that exempt days must have notes explaining the reason.

### Q: Should exempt days require approval?
**A:** The MVP doesn't have an approval workflow - owners directly mark days as exempt. If you need formal approval, see the dedicated Leave model alternative.

### Q: How many exempt days is reasonable?
**A:** That's a business policy question. The system doesn't impose limits - owners can mark as many days as needed.

### Q: Should we distinguish sick leave from vacation?
**A:** In the MVP, you'd use the note field to document the type. A Phase 2 enhancement could add an `exemptType` field with categories.

---

## Migration Questions

### Q: Can I backfill old sick days?
**A:** Yes! Add exempt overrides for past dates. See the migration script example in [README.md](./README.md).

### Q: What if I have overrides that should be exempt?
**A:** Update them:
```typescript
await prisma.workArrivalOverride.update({
  where: { id: overrideId },
  data: { exempt: true }
});
```

### Q: Do I need to migrate from another system?
**A:** If you're tracking exemptions elsewhere (spreadsheet, etc.), you can write a script to import them as exempt overrides.

---

## Future Enhancement Questions

### Q: Can this evolve into a full leave management system?
**A:** Yes! The exempt flag is a stepping stone. See the evolution path in [VISUAL_SUMMARY.md](./VISUAL_SUMMARY.md):
- Phase 1: Simple exempt flag (MVP)
- Phase 2: Categorization (sick, vacation, etc.)
- Phase 3: Bulk operations (date ranges)
- Phase 4: Full leave system (approval, balance tracking)

### Q: What about leave balance tracking?
**A:** Not in MVP, but planned for Phase 4. You'd track allotted days, used days, and remaining balance per leave type.

### Q: What about approval workflows?
**A:** Not in MVP. Phase 4 could add:
- Members request leave
- Owners approve/reject
- Status tracking (pending, approved, rejected)
- Email notifications

### Q: What about team calendars?
**A:** Phase 4+ could add a team view showing everyone's leave at once, helping avoid conflicts.

---

## Testing Questions

### Q: What should I test?
**A:** See the testing checklist in [QUICK_START.md](./QUICK_START.md):
- Create exempt override
- Verify no penalty
- Check-in on exempt day
- Toggle exempt flag
- Delete exempt override

### Q: How do I test manually?
**A:** 
1. Start dev server
2. Create a test member
3. Add exempt override
4. Check the calendar shows no penalty
5. Try checking in on exempt day
6. Verify penalty doesn't appear

### Q: Are there automated tests?
**A:** You should add unit tests for:
- `dayCounts()` with exempt override
- `chargeWorkArrivalDay()` with exempt day
- Form validation with exempt checkbox

---

## Performance Questions

### Q: Will this slow down the app?
**A:** No measurable impact:
- Boolean field: 1 byte per override
- Boolean check: nanoseconds
- Early return: actually slightly faster for exempt days

### Q: How much database space does this use?
**A:** 1 byte per override = negligible. Even 100,000 overrides = only 100 KB.

### Q: Are there query optimizations needed?
**A:** No, but you can optionally add a partial index on `exempt = true` for faster filtering.

---

## Business Questions

### Q: What's the ROI of this feature?
**A:** 
- **Development cost:** ~2 hours
- **User satisfaction:** High (eliminates unfair penalties)
- **Support burden:** Reduced (fewer complaints about sick day penalties)
- **Policy compliance:** Better (fair absence handling)

### Q: Who benefits from this?
**A:**
- **Members:** Fair treatment when sick/on leave
- **Owners:** Easy absence management
- **Business:** Professional tracking system

### Q: What's the priority?
**A:** Depends on your team:
- **High priority** if you have frequent complaints about sick day penalties
- **Medium priority** if it's occasionally an issue
- **Low priority** if your team rarely uses sick leave

---

## Decision Support

### Q: Should we implement this now or wait?
**A:** Implement now if:
- ✅ Users have complained about unfair sick day penalties
- ✅ You want fair absence handling
- ✅ You have 2 hours of dev time available
- ✅ You value member satisfaction

Wait if:
- ⏸️ Sick leave is extremely rare in your team
- ⏸️ You have higher priority features
- ⏸️ You're planning a complete leave system overhaul soon

### Q: Which alternative approach should we choose?
**A:** See the decision tree in [sick-leave-alternatives.md](./sick-leave-alternatives.md):
- **Override + Exempt** (recommended): Simple, fast, flexible
- **Dedicated Leave Model**: Complex policies, approval workflows needed
- **Other approaches**: Not recommended for most teams

### Q: What if we're not sure?
**A:** Start with Override + Exempt (MVP). It's:
- Low risk
- Fast to implement
- Easy to extend later
- Doesn't lock you in

You can always migrate to a more complex system later if needed.

---

## Documentation Questions

### Q: Where is all the documentation?
**A:** In `/docs/proposals/`:
- **README.md** - Comprehensive overview
- **QUICK_START.md** - Implementation steps
- **VISUAL_SUMMARY.md** - Visual explanations
- **sick-leave-override.md** - Full proposal
- **sick-leave-implementation-example.md** - Code examples
- **sick-leave-override-diagram.md** - Flow diagrams
- **sick-leave-alternatives.md** - Alternative approaches
- **FAQ.md** - This document

### Q: Which document should I read first?
**A:** Depends on your role:
- **Developer:** Start with [QUICK_START.md](./QUICK_START.md)
- **Product Manager:** Start with [VISUAL_SUMMARY.md](./VISUAL_SUMMARY.md)
- **Technical Lead:** Start with [README.md](./README.md)
- **Designer:** Check [sick-leave-override-diagram.md](./sick-leave-override-diagram.md)

### Q: Is there a video walkthrough?
**A:** Not yet, but the visual diagrams in VISUAL_SUMMARY.md show the UI changes clearly.

---

## Support Questions

### Q: Who do I ask if I have more questions?
**A:** 
- **Technical questions:** Development team
- **Feature requests:** Product owner
- **UI/UX feedback:** Design team
- **Policy questions:** Team lead / HR

### Q: Can I request changes to the proposal?
**A:** Yes! The proposal is a starting point. Provide feedback on:
- What you like
- What concerns you have
- What additional requirements you need

### Q: Where do I report bugs after implementation?
**A:** Use the standard issue tracker on GitHub (`sciffany/hunt-fund`).

---

## Common Concerns Addressed

### "This seems too simple - are we missing something?"

No! Sometimes the best solutions are simple. One boolean flag solves the core problem. You can always add complexity later if actually needed.

### "What if users abuse this?"

Only owners can mark days as exempt (not members themselves). Owners should follow company leave policies when granting exemptions.

### "Won't we need a full leave system eventually?"

Maybe, maybe not. Many teams never need it. Start simple, validate the need, then extend if required. The exempt flag can evolve into a full system.

### "Can't we just manually credit back penalties?"

You could, but:
- It's extra work
- The day still shows as "miss" in stats
- It's confusing in reports
- Exemption is the right conceptual model

### "What about fraud prevention?"

The same safeguards as current overrides:
- Only owners can add them
- All changes are logged with timestamps
- Audit trail exists in database
- Notes document reasons

---

## Quick Decision Matrix

| If you need... | Choose... |
|---------------|-----------|
| Simple sick leave handling | Override + Exempt ⭐ |
| Approval workflows | Dedicated Leave Model |
| Leave balance tracking | Dedicated Leave Model |
| Quick implementation | Override + Exempt ⭐ |
| Future flexibility | Override + Exempt ⭐ |
| Rich leave analytics | Dedicated Leave Model |
| MVP / validation | Override + Exempt ⭐ |
| Enterprise features | Dedicated Leave Model |

**⭐ = Recommended starting point**

---

## Still Have Questions?

1. Read the full proposal: [README.md](./README.md)
2. Check alternative approaches: [sick-leave-alternatives.md](./sick-leave-alternatives.md)
3. Review implementation guide: [QUICK_START.md](./QUICK_START.md)
4. Contact the development team

---

**Ready to proceed? See [QUICK_START.md](./QUICK_START.md) to begin implementation!**
