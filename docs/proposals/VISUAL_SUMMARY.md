# Visual Summary: Sick Leave Override Feature

## The Problem (Current Behavior)

```
┌─────────────────────────────────────────────────────────────┐
│  Member: John Doe                        Month: November    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun                         │
│        1    2    3    4    5    6                           │
│       ✓    ✓    ✓    ✓                                     │
│                                                             │
│   7    8    9   10   11   12   13                          │
│   ✓   🤒   ✓    ✓    ✓                                    │
│      MISS                                                   │
│      💰$10  ← PROBLEM: Penalized even though sick!        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

John was sick on Nov 8 but got charged $10 penalty
```

---

## The Solution (With Exempt Flag)

```
┌─────────────────────────────────────────────────────────────┐
│  Member: John Doe                        Month: November    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun                         │
│        1    2    3    4    5    6                           │
│       ✓    ✓    ✓    ✓                                     │
│                                                             │
│   7    8    9   10   11   12   13                          │
│   ✓   🏥   ✓    ✓    ✓                                    │
│     EXEMPT                                                  │
│     💚 $0   ← SOLUTION: No penalty! Fair tracking.        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Owner marked Nov 8 as exempt (sick leave) - no penalty charged
```

---

## How It Works (3 Simple Steps)

```
┌─────────────────────┐
│  1. Owner opens     │
│  member settings    │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  2. In "Work day overrides":            │
│                                         │
│  Work day:  [2024-11-08]                │
│                                         │
│  ☑ Exempt from tracking                 │
│    (sick leave, vacation, etc.)         │
│                                         │
│  Note: [Sick leave____________]         │
│                                         │
│  [Add override]                         │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────┐
│  3. Day is now      │
│  exempt - no        │
│  penalty charged!   │
└─────────────────────┘
```

---

## Database Change (One Field)

```
┌────────────────────────────────────────────────┐
│  WorkArrivalOverride Table                     │
├────────────────────────────────────────────────┤
│  id                 string                     │
│  groupMemberId      string                     │
│  date               date                       │
│  timezone           string                     │
│  arrivalMinutes     number                     │
│  note               string?                    │
│  exempt             boolean    ← NEW! 🎯      │
│  createdAt          datetime                   │
│  updatedAt          datetime                   │
└────────────────────────────────────────────────┘

Just one boolean field - that's it!
```

---

## Code Change (One If Statement)

```typescript
// In lib/work-arrival.ts

function dayCounts(date, target, override): boolean {
  
  if (override?.exempt) return false;  // ← NEW! Just this line! 🎯
  
  if (override) return true;
  if (!target) return false;
  return target.days[weekdayOfDate(date)];
}
```

**That's the core logic change - one line!**

---

## UI Before vs After

### Before (No Exemption Option)
```
┌────────────────────────────────────────┐
│ Add a work day override                │
├────────────────────────────────────────┤
│                                        │
│ Work day:    [2024-11-08]              │
│ Timezone:    [Asia/Singapore ▾]        │
│ Arrive by:   [09:00]                   │
│ Note:        [________________]        │
│                                        │
│         [Add override]                 │
└────────────────────────────────────────┘
```

### After (With Exemption Checkbox)
```
┌────────────────────────────────────────┐
│ Add a work day override                │
├────────────────────────────────────────┤
│                                        │
│ ☑ Exempt from tracking                 │  ← NEW!
│   (sick leave, vacation, etc.)         │
│                                        │
│ Work day:    [2024-11-08]              │
│ Timezone:    [Asia/Singapore ▾]        │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ Arrive by:  (Hidden when exempt)   │ │  ← Smart!
│ └────────────────────────────────────┘ │
│                                        │
│ Note:        [Sick leave_______]       │
│                                        │
│         [Add override]                 │
└────────────────────────────────────────┘
```

---

## Use Cases

### ✅ Use Case 1: Single Sick Day
```
Scenario: John is sick on Friday
Action:   Owner adds exempt override for Friday
Result:   No penalty, shows "Sick leave" in calendar
Time:     30 seconds to add override
```

### ✅ Use Case 2: Week-Long Vacation  
```
Scenario: Sarah takes vacation Mon-Fri (5 days)
Action:   Owner adds 5 exempt overrides
Result:   No penalties all week, clear vacation marking
Time:     2 minutes to add 5 overrides
```

### ✅ Use Case 3: Public Holiday
```
Scenario: Office closed for national holiday
Action:   Owner adds exempt override for all members
Result:   No one gets penalized for holiday
Time:     1 minute per member
```

### ✅ Use Case 4: Medical Appointment
```
Scenario: Bob has doctor appointment, arrives late
Action:   Option A: Exempt the whole day
         Option B: Override with later arrival time
Result:   Flexible - choose full exemption or just later time
```

---

## Benefits Matrix

| Stakeholder | Benefit | Impact |
|------------|---------|--------|
| **Members** | No unfair penalties on sick days | 😊 High satisfaction |
| **Owners** | Easy absence management | ⚡ Simple 1-click action |
| **Developers** | Quick implementation | 🚀 1-2 days work |
| **Business** | Fair tracking policies | 💼 Professional system |

---

## Implementation Effort

```
┌─────────────────────────────────────────────────────┐
│  Task                         Time    Difficulty    │
├─────────────────────────────────────────────────────┤
│  1. Database migration        5 min   ⭐           │
│  2. Schema update             2 min   ⭐           │
│  3. Type definitions          5 min   ⭐           │
│  4. Logic update (dayCounts)  5 min   ⭐           │
│  5. Action update             20 min  ⭐⭐         │
│  6. Component updates         20 min  ⭐⭐         │
│  7. Query updates             10 min  ⭐           │
│  8. Testing                   30 min  ⭐⭐         │
│  9. Code review               15 min  ⭐           │
│  10. Deployment               15 min  ⭐           │
├─────────────────────────────────────────────────────┤
│  TOTAL                        ~2 hours             │
└─────────────────────────────────────────────────────┘

⭐ = Easy    ⭐⭐ = Moderate
```

---

## Risk Assessment

```
┌──────────────────────────────────────────────────┐
│  Risk Factor           Level      Mitigation      │
├──────────────────────────────────────────────────┤
│  Breaking changes      🟢 Low     Default false   │
│  Data loss             🟢 None    Additive only   │
│  Performance           🟢 None    1 boolean check │
│  User confusion        🟢 Low     Clear checkbox  │
│  Complex logic         🟢 Low     1 if statement  │
│  Rollback difficulty   🟢 Low     Easy to revert  │
├──────────────────────────────────────────────────┤
│  OVERALL RISK          🟢 LOW                     │
└──────────────────────────────────────────────────┘
```

---

## Comparison: With vs Without Feature

### Without Exempt Feature ❌
```
Problem: Sick on Monday
├─ Must choose:
│  ├─ Don't check in → Get $10 penalty 💸
│  ├─ Check in from home → Defeats location tracking 🏠
│  └─ Override arrival time → Still counts as work day 📅
└─ Result: Unfair, members upset 😞
```

### With Exempt Feature ✅
```
Solution: Sick on Monday
├─ Owner marks day as exempt
├─ System behavior:
│  ├─ Day doesn't count for tracking ✓
│  ├─ No penalty charged ✓
│  ├─ Note documents reason ✓
│  └─ Calendar shows exemption clearly ✓
└─ Result: Fair, everyone happy 😊
```

---

## Evolution Path (Future-Proof)

```
Phase 1 (NOW)          Phase 2 (Later)        Phase 3 (Future)
──────────────────     ──────────────────     ──────────────────
Simple checkbox        Categorization         Full leave system
                                              
exempt: boolean   →    exemptType:       →    Leave model with:
                       - SICK                 - Approval workflow
                       - VACATION             - Balance tracking
                       - HOLIDAY              - History reports
                       - OTHER                - Team calendar

START HERE! ⭐         Add if needed          Add if required
Simple & fast          More detail            Enterprise features
```

**Start simple, evolve based on actual needs!**

---

## Decision Time

### 👍 APPROVE: If you want...
- ✅ Quick solution (1-2 days)
- ✅ Low risk implementation
- ✅ Simple user experience
- ✅ Fair absence handling

**→ See [QUICK_START.md](./QUICK_START.md) to begin**

### 🤔 DISCUSS: If you need...
- 🔸 Different approach
- 🔸 More features first
- 🔸 Different UI

**→ See [sick-leave-alternatives.md](./sick-leave-alternatives.md)**

### ⏸️ DEFER: If not now...
- 📁 Proposal saved for later
- 📁 Can revisit anytime
- 📁 No action needed

---

## Quick Comparison with Alternatives

```
┌─────────────────────────────────────────────────────────────┐
│  Approach              Complexity  Time     Flexibility      │
├─────────────────────────────────────────────────────────────┤
│  Override + Exempt     🟢 Low      1-2 day  🟢 High         │  ⭐ RECOMMENDED
│  Dedicated Leave       🔴 High     1-2 week 🟢 Very High    │
│  JSON Array            🟡 Medium   2-3 day  🔴 Low          │
│  Sick Model Only       🟡 Medium   3-5 day  🔴 Low          │
│  Negative Penalties    🔴 High     3-4 day  🔴 Low          │
└─────────────────────────────────────────────────────────────┘

Legend: 🟢 = Good  🟡 = Okay  🔴 = Poor
```

---

## Summary in One Image

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│              SICK LEAVE OVERRIDE FEATURE               │
│                                                        │
│  ┌──────────────┐         ┌──────────────┐           │
│  │   PROBLEM    │         │   SOLUTION   │           │
│  ├──────────────┤         ├──────────────┤           │
│  │ Sick day =   │         │ Add exempt   │           │
│  │ $10 penalty  │    →    │ checkbox     │           │
│  │ 😞 Unfair    │         │ 😊 Fair!     │           │
│  └──────────────┘         └──────────────┘           │
│                                                        │
│  Implementation:  1 database field + 1 if statement   │
│  Effort:          ~2 hours development                │
│  Risk:            🟢 Low                               │
│  Impact:          😊 High user satisfaction           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

**Ready to implement? See [QUICK_START.md](./QUICK_START.md)**

**Want full details? See [README.md](./README.md)**

**Questions? All docs in `/docs/proposals/`**
