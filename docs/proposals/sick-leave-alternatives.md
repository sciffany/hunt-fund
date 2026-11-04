# Sick Leave Override - Alternative Approaches

This document explores different approaches to implementing sick leave functionality, with pros, cons, and recommendations.

## Overview of Alternatives

1. **Extend WorkArrivalOverride with exempt flag** ⭐ (Recommended)
2. **Create dedicated Leave/Absence model**
3. **Add exemptDays JSON field to WorkArrivalTarget**
4. **Negative penalties (credits) for sick days**
5. **Separate SickLeaveDay model**

---

## Alternative 1: Extend WorkArrivalOverride (RECOMMENDED)

### Implementation
Add `exempt: boolean` field to `WorkArrivalOverride` table.

### Pros
- ✅ Simple implementation (one field, one checkbox)
- ✅ Reuses existing override infrastructure
- ✅ Backward compatible (default `false`)
- ✅ Flexible (can exempt for any reason, not just sick leave)
- ✅ Natural fit - exemption is an override of normal rules
- ✅ No new UI section needed
- ✅ Easy to understand and maintain

### Cons
- ❌ Mixing two concepts (time changes and exemptions) in one model
- ❌ Can't easily distinguish sick leave from vacation in reports
- ❌ No dedicated fields for sick leave metadata (medical cert, approval)

### Best For
- MVP/quick implementation
- Small teams without complex leave policies
- When leave tracking detail isn't critical

### Migration Path
Easy to extend later with a dedicated leave system if needed.

```typescript
// Can evolve to:
exempt: boolean
exemptReason: "SICK" | "VACATION" | "HOLIDAY" | "OTHER"
```

---

## Alternative 2: Dedicated Leave/Absence Model

### Implementation
New `Leave` table with types, approval status, date ranges.

```prisma
model Leave {
  id              String      @id @default(cuid())
  groupMemberId   String
  groupMember     GroupMember @relation(fields: [groupMemberId], references: [id])
  startDate       DateTime    @db.Date
  endDate         DateTime    @db.Date
  leaveType       LeaveType   // SICK, VACATION, PERSONAL, etc.
  status          LeaveStatus // PENDING, APPROVED, REJECTED
  requestedAt     DateTime    @default(now())
  approvedAt      DateTime?
  approvedBy      String?
  note            String?
  medicalCertPath String?     // Path to uploaded certificate
  
  @@unique([groupMemberId, startDate, endDate])
}

enum LeaveType {
  SICK_LEAVE
  VACATION
  PERSONAL_LEAVE
  PUBLIC_HOLIDAY
  UNPAID_LEAVE
  MATERNITY_PATERNITY
}

enum LeaveStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}
```

### Logic Integration
```typescript
function dayCounts(
  date: string,
  target: WorkArrivalTargetForCharge | undefined,
  override: WorkArrivalOverrideForCharge | undefined,
  leaves: LeaveForCharge[],  // NEW
): boolean {
  // Check if date falls within any approved leave
  const onLeave = leaves.some(leave => 
    leave.status === "APPROVED" &&
    date >= leave.startDate &&
    date <= leave.endDate
  );
  if (onLeave) return false;
  
  // ... rest of logic
}
```

### Pros
- ✅ Proper separation of concerns
- ✅ Can add rich leave metadata (type, approval, documents)
- ✅ Date ranges (multi-day leave in one record)
- ✅ Approval workflow support
- ✅ Better reporting and analytics
- ✅ Can track leave balances (days remaining)
- ✅ Future-proof for complex policies

### Cons
- ❌ More complex implementation
- ❌ New UI section needed (leave management)
- ❌ More database tables and relationships
- ❌ Migration from existing overrides is harder
- ❌ Overkill for simple use cases

### Best For
- Large organizations with formal leave policies
- When leave approval workflows are needed
- When detailed leave analytics are important
- Teams that need to track leave balances

---

## Alternative 3: JSON exemptDays in WorkArrivalTarget

### Implementation
Add `exemptDays: string[]` (array of dates) to `WorkArrivalTarget`.

```prisma
model WorkArrivalTarget {
  // ... existing fields ...
  exemptDays Json  // ["2024-11-15", "2024-11-16", ...]
}
```

### Usage
```typescript
const target = {
  effectiveFrom: "2024-11-01",
  arrivalMinutes: 540,
  exemptDays: ["2024-11-15", "2024-11-20"],
  // ...
};

function dayCounts(date: string, target: WorkArrivalTargetForCharge): boolean {
  if (target.exemptDays.includes(date)) return false;
  // ...
}
```

### Pros
- ✅ Keeps exemptions with the target they apply to
- ✅ Simple data structure (array of dates)
- ✅ Easy to check (array includes)

### Cons
- ❌ JSON array is awkward to query and update
- ❌ No way to add notes per exempt day
- ❌ Hard to see all exemptions across targets
- ❌ Violates normalization (dates scattered across targets)
- ❌ When target changes, must migrate exempt days
- ❌ No way to set exempt days before target exists
- ❌ Difficult to add metadata (reason, approval, etc.)

### Best For
- Not recommended for this use case

---

## Alternative 4: Negative Penalties (Credits)

### Implementation
Allow negative penalty amounts to "credit back" sick days.

```typescript
// Add a penalty override that gives credit
const sickDayCredit = {
  date: "2024-11-15",
  amount: "-10.00",  // Negative = credit
  note: "Sick leave credit"
};
```

### Pros
- ✅ Works with existing penalty system
- ✅ Can partially compensate (50% credit for half-day)

### Cons
- ❌ Conceptually confusing (negative penalties)
- ❌ Day still "counts" in statistics
- ❌ Accounting complexity (credits vs exemptions)
- ❌ Doesn't prevent the charge, just offsets it
- ❌ Check-ins still required or day shows as "miss"
- ❌ Harder to understand in reports

### Best For
- Not recommended - conceptually wrong approach

---

## Alternative 5: Separate SickLeaveDay Model

### Implementation
Create a dedicated model just for sick leave tracking.

```prisma
model SickLeaveDay {
  id            String      @id @default(cuid())
  groupMemberId String
  groupMember   GroupMember @relation(fields: [groupMemberId], references: [id])
  date          DateTime    @db.Date
  note          String?
  medicalCert   Boolean     @default(false)
  createdAt     DateTime    @default(now())
  
  @@unique([groupMemberId, date])
}
```

### Pros
- ✅ Clear purpose (only sick leave)
- ✅ Can add sick-leave-specific fields
- ✅ Easy to query sick leave patterns

### Cons
- ❌ Limited to sick leave (need separate models for vacation, etc.)
- ❌ Duplicate functionality with overrides
- ❌ More models = more complexity
- ❌ Still need override system for other changes
- ❌ Two places to check when calculating charges

### Best For
- Organizations that only need sick leave (not other exemptions)
- When sick leave requires very specific tracking

---

## Comparison Matrix

| Feature | Override+Exempt | Dedicated Leave | JSON Array | Sick Model |
|---------|----------------|-----------------|------------|------------|
| **Complexity** | Low | High | Medium | Medium |
| **Implementation Time** | 1-2 days | 1-2 weeks | 2-3 days | 3-5 days |
| **Flexibility** | High | Very High | Low | Low |
| **Type Safety** | Good | Excellent | Poor | Good |
| **Reporting** | Basic | Advanced | Poor | Good |
| **Approval Workflow** | Manual | Built-in | Manual | Manual |
| **Multi-day Leave** | Per day | Date range | Array | Per day |
| **Metadata** | Note only | Rich | None | Some |
| **UI Complexity** | Low | High | Medium | Medium |
| **Backward Compat** | Perfect | Good | Poor | Good |
| **Future Extensible** | Medium | High | Low | Medium |

---

## Recommendation Decision Tree

```
Does your organization need:

1. Leave approval workflows?
   YES → Use Dedicated Leave Model (Alternative 2)
   NO  → Continue to #2

2. Different leave types with different rules?
   YES → Use Dedicated Leave Model (Alternative 2)
   NO  → Continue to #3

3. Complex leave analytics and reporting?
   YES → Use Dedicated Leave Model (Alternative 2)
   NO  → Continue to #4

4. Just need to mark some days as exempt?
   YES → Use Override+Exempt (Alternative 1) ⭐
```

---

## Hybrid Approach (Future-Proof)

Start with **Alternative 1** (Override+Exempt), but design it to evolve:

### Phase 1: MVP (Week 1)
```typescript
exempt: boolean
note: string?  // "Sick leave", "Vacation", etc.
```

### Phase 2: Categorization (Week 4)
```typescript
exempt: boolean
exemptType: "SICK" | "VACATION" | "HOLIDAY" | "OTHER"
note: string?
```

### Phase 3: Full System (Month 3)
Migrate to dedicated Leave model if needed:
```typescript
// Migration script to convert exempt overrides to leave records
const exemptOverrides = await prisma.workArrivalOverride.findMany({
  where: { exempt: true }
});

for (const override of exemptOverrides) {
  await prisma.leave.create({
    data: {
      groupMemberId: override.groupMemberId,
      startDate: override.date,
      endDate: override.date,
      leaveType: inferTypeFromNote(override.note),
      status: "APPROVED",
      note: override.note,
    }
  });
}
```

---

## Final Recommendation

**Start with Alternative 1: Override+Exempt**

Why:
1. **Fastest to implement** - Can ship in 1-2 days
2. **Lowest risk** - Minimal schema changes
3. **User validation** - Learn what users actually need
4. **Easy to extend** - Can evolve to dedicated system later
5. **Backward compatible** - No breaking changes
6. **Simple UX** - One checkbox, users understand immediately

When to migrate to Alternative 2:
- When you need approval workflows
- When users request leave balance tracking
- When reporting needs become complex
- When you have >20 active users
- When leave policy becomes formal

The override+exempt approach is not a dead-end; it's a pragmatic first step that can evolve based on real usage patterns.

---

## Code Reusability

Even if you later migrate to a dedicated Leave system, the exempt logic can be reused:

```typescript
// Current: Override-based
function dayCounts(date, target, override) {
  if (override?.exempt) return false;
  // ...
}

// Future: Leave-based (same logic pattern)
function dayCounts(date, target, override, leaves) {
  // NEW: Check leave system
  if (leaves.some(l => l.covers(date))) return false;
  
  // OLD: Still support override.exempt for backward compat
  if (override?.exempt) return false;
  
  // ...
}
```

The exempt flag becomes a fallback/legacy path while the Leave system becomes primary.
