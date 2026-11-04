# Sick Leave Override - Visual Flow Diagram

## Current System (Before)

```
┌─────────────────────────────────────────────────────┐
│ Work Arrival Day Calculation                        │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │ Check if override exists      │
        │ for this date?                │
        └───────────────────────────────┘
                │               │
           Yes  │               │ No
                │               │
                ▼               ▼
        ┌─────────────┐   ┌─────────────────┐
        │ Use         │   │ Check target    │
        │ override    │   │ weekday days[]  │
        │ time        │   │ for this date   │
        └─────────────┘   └─────────────────┘
                │               │
                │               │
                └───────┬───────┘
                        │
                        ▼
              ┌──────────────────┐
              │ Day counts       │
              │ = TRUE           │
              └──────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │ Calculate        │
              │ penalty if       │
              │ late/missing     │
              └──────────────────┘
```

**Problem:** Even with an override, the day still counts and can incur penalties!

---

## Proposed System (After)

```
┌─────────────────────────────────────────────────────┐
│ Work Arrival Day Calculation                        │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │ Check if override exists      │
        │ for this date?                │
        └───────────────────────────────┘
                │               │
           Yes  │               │ No
                │               │
                ▼               ▼
        ┌─────────────┐   ┌─────────────────┐
        │ Is          │   │ Check target    │
        │ exempt      │   │ weekday days[]  │
        │ = true?     │   │ for this date   │
        └─────────────┘   └─────────────────┘
          │           │           │
     Yes  │      No   │           │
          │           │           │
          ▼           └─────┬─────┘
    ┌──────────┐           │
    │ Day      │           │
    │ counts   │           ▼
    │ = FALSE  │   ┌──────────────┐
    └──────────┘   │ Day counts   │
          │        │ = TRUE       │
          │        └──────────────┘
          │                │
          │                ▼
          │        ┌──────────────────┐
          │        │ Calculate        │
          │        │ penalty if       │
          │        │ late/missing     │
          │        └──────────────────┘
          │                │
          └────────┬───────┘
                   │
                   ▼
        ┌────────────────────┐
        │ Display in         │
        │ calendar           │
        └────────────────────┘
```

**Solution:** Exempt days exit early, no penalties calculated!

---

## Data Model Changes

### Before
```
WorkArrivalOverride {
  id: string
  groupMemberId: string
  date: Date
  timezone: string
  arrivalMinutes: number    ← Only changes the time
  note: string?
}
```

### After
```
WorkArrivalOverride {
  id: string
  groupMemberId: string
  date: Date
  timezone: string
  arrivalMinutes: number
  note: string?
  exempt: boolean           ← NEW: Marks day as exempt
}
```

---

## UI Changes

### Override Form - Before
```
┌────────────────────────────────────────┐
│ Add a work day override                │
├────────────────────────────────────────┤
│ Work day:          [2024-11-15]        │
│ Timezone:          [Asia/Singapore ▾]  │
│ Arrive by:         [09:00]             │
│ Note (optional):   [_____________]     │
│                                        │
│              [Add override]            │
└────────────────────────────────────────┘
```

### Override Form - After
```
┌────────────────────────────────────────┐
│ Add a work day override                │
├────────────────────────────────────────┤
│ [✓] Exempt from tracking (sick leave)  │  ← NEW
│                                        │
│ Work day:          [2024-11-15]        │
│ Timezone:          [Asia/Singapore ▾]  │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ Arrive by:   [09:00]               │ │  ← Hidden when
│ └────────────────────────────────────┘ │     exempt=true
│                                        │
│ Note (optional):   [Sick leave___]     │
│ For sick leave, note "Sick leave"      │
│                                        │
│              [Add override]            │
└────────────────────────────────────────┘
```

---

## Example Use Cases

### Case 1: Single Sick Day
```
Member: John Doe
Date: November 15, 2024

Action: Add override with exempt=true, note="Sick leave"

Result:
- November 15 doesn't count as a work day
- No penalty charged even with no check-in
- Shows in calendar as "Sick leave"
```

### Case 2: Multiple Sick Days
```
Member: Jane Smith
Dates: November 15-17, 2024 (3 days)

Action: Add 3 separate overrides, each with exempt=true

Result:
- All 3 days exempt from tracking
- Can add notes like "Sick leave - Day 1 of 3"
```

### Case 3: Return from Sick Leave
```
Member: Bob Johnson
Date: November 15 (sick), November 16 (return late)

Actions:
- Nov 15: Override with exempt=true
- Nov 16: Override with arrivalMinutes=600 (10:00 AM), exempt=false

Result:
- Nov 15: No penalty
- Nov 16: Later arrival time, still tracked and penalized if late
```

---

## Calendar Display Examples

### Month View - With Exempt Days

```
November 2024 - John Doe

Mon   Tue   Wed   Thu   Fri   Sat   Sun
                  1     2     3     4     5
                  ✓     ✓     ✗
                  9:00  9:05  MISS

6     7     8     9     10    11    12
✓     ✓     [🏥]  ✓     ✓
9:02  8:55  SICK  9:00  9:10
            LEAVE

13    14    15    16    17    18    19
✓     ✓     ✓     ✓     ✓
9:00  9:05  8:58  9:00  9:02

Legend:
✓ = On time
✗ = Late/Missing (penalty)
[🏥] = Exempt (sick leave, no penalty)
```

---

## Implementation Phases

### Phase 1: Core Functionality (MVP)
```
1. Database migration (add exempt column)
2. Update Prisma schema
3. Modify dayCounts() logic
4. Update saveWorkArrivalOverride action
5. Add checkbox to UI form
```

### Phase 2: Enhanced Display
```
6. Add visual indicators for exempt days in calendar
7. Show exempt day count in monthly summary
8. Add filter to show/hide exempt days
```

### Phase 3: Quality of Life
```
9. Bulk add exempt days (date range picker)
10. Exemption type dropdown (sick, vacation, holiday)
11. Copy note from previous override
```

### Phase 4: Reporting (Future)
```
12. Leave balance tracking
13. Leave history reports
14. Export leave records
15. Leave approval workflow
```
