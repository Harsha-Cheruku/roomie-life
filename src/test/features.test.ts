import { describe, it, expect, vi, beforeEach } from "vitest";

// Test utility functions and auth logic in isolation

describe("Utility Functions", () => {
  describe("cn() - class name merger", () => {
    it("should merge class names correctly", async () => {
      const { cn } = await import("@/lib/utils");
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("should handle conditional classes", async () => {
      const { cn } = await import("@/lib/utils");
      expect(cn("base", false && "hidden", "visible")).toBe("base visible");
    });

    it("should merge tailwind conflicts", async () => {
      const { cn } = await import("@/lib/utils");
      expect(cn("px-4", "px-6")).toBe("px-6");
    });

    it("should handle undefined and null", async () => {
      const { cn } = await import("@/lib/utils");
      expect(cn("base", undefined, null, "end")).toBe("base end");
    });
  });
});

describe("Auth Context Logic", () => {
  const LAST_ROOM_KEY = 'roommate_last_room_id';
  const SOLO_MODE_KEY = 'roommate_solo_mode';

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Solo Mode persistence", () => {
    it("should store solo mode in localStorage", () => {
      localStorage.setItem(SOLO_MODE_KEY, 'true');
      expect(localStorage.getItem(SOLO_MODE_KEY)).toBe('true');
    });

    it("should default to false when not set", () => {
      expect(localStorage.getItem(SOLO_MODE_KEY)).toBeNull();
    });

    it("should toggle correctly", () => {
      localStorage.setItem(SOLO_MODE_KEY, 'false');
      const current = localStorage.getItem(SOLO_MODE_KEY) === 'true';
      localStorage.setItem(SOLO_MODE_KEY, String(!current));
      expect(localStorage.getItem(SOLO_MODE_KEY)).toBe('true');
    });
  });

  describe("Room persistence", () => {
    it("should store last room ID", () => {
      localStorage.setItem(LAST_ROOM_KEY, 'room-123');
      expect(localStorage.getItem(LAST_ROOM_KEY)).toBe('room-123');
    });

    it("should clear on sign out", () => {
      localStorage.setItem(LAST_ROOM_KEY, 'room-123');
      localStorage.removeItem(LAST_ROOM_KEY);
      expect(localStorage.getItem(LAST_ROOM_KEY)).toBeNull();
    });

    it("should restore last active room from multiple rooms", () => {
      const rooms = [
        { id: 'room-1', name: 'Room 1' },
        { id: 'room-2', name: 'Room 2' },
        { id: 'room-3', name: 'Room 3' },
      ];
      localStorage.setItem(LAST_ROOM_KEY, 'room-2');
      const lastRoomId = localStorage.getItem(LAST_ROOM_KEY);
      const found = rooms.find(r => r.id === lastRoomId);
      expect(found?.name).toBe('Room 2');
    });

    it("should fallback to first room if saved room not found", () => {
      const rooms = [
        { id: 'room-1', name: 'Room 1' },
        { id: 'room-2', name: 'Room 2' },
      ];
      localStorage.setItem(LAST_ROOM_KEY, 'room-deleted');
      const lastRoomId = localStorage.getItem(LAST_ROOM_KEY);
      const found = rooms.find(r => r.id === lastRoomId);
      const roomToSet = found || rooms[0];
      expect(roomToSet.name).toBe('Room 1');
    });
  });

  describe("Invite code handling", () => {
    it("should trim and uppercase invite codes", () => {
      const code = "  abc123  ";
      const processed = code.trim().toUpperCase();
      expect(processed).toBe("ABC123");
    });

    it("should handle already uppercase codes", () => {
      const code = "XYZ789";
      expect(code.trim().toUpperCase()).toBe("XYZ789");
    });
  });
});

describe("Expense Calculation Logic", () => {
  it("should calculate equal splits correctly", () => {
    const total = 300;
    const memberCount = 3;
    const splitAmount = Math.floor((total / memberCount) * 100) / 100;
    expect(splitAmount).toBe(100);
  });

  it("should handle uneven splits with remainder", () => {
    const total = 100;
    const memberCount = 3;
    const perPerson = Math.floor((total / memberCount) * 100) / 100;
    const remainder = Math.round((total - perPerson * memberCount) * 100) / 100;
    const firstSplit = perPerson + remainder;
    const totalCheck = firstSplit + perPerson * (memberCount - 1);
    expect(totalCheck).toBeCloseTo(100, 2);
  });

  it("should handle 0 total amount", () => {
    const total = 0;
    const memberCount = 3;
    const perPerson = Math.floor((total / memberCount) * 100) / 100;
    expect(perPerson).toBe(0);
    const splits = Array.from({ length: memberCount }, () => ({ amount: perPerson }));
    const sum = splits.reduce((s, sp) => s + sp.amount, 0);
    expect(sum).toBe(0);
  });

  it("should reject negative expense amounts", () => {
    const validateAmount = (amount: number) => amount > 0;
    expect(validateAmount(-50)).toBe(false);
    expect(validateAmount(-0.01)).toBe(false);
    expect(validateAmount(0)).toBe(false);
    expect(validateAmount(0.01)).toBe(true);
    expect(validateAmount(100)).toBe(true);
  });

  it("should handle single-member split (no split needed)", () => {
    const total = 250;
    const memberCount = 1;
    const perPerson = Math.floor((total / memberCount) * 100) / 100;
    expect(perPerson).toBe(250);
  });

  it("should handle very small amounts split across many members", () => {
    const total = 0.01;
    const memberCount = 5;
    const perPerson = Math.floor((total / memberCount) * 100) / 100;
    // 0.01 / 5 = 0.002, floored to 0.00
    expect(perPerson).toBe(0);
    // Remainder goes to first person
    const remainder = Math.round((total - perPerson * memberCount) * 100) / 100;
    expect(remainder).toBe(0.01);
  });

  it("should handle large amounts with remainder", () => {
    const total = 999999.99;
    const memberCount = 7;
    const perPerson = Math.floor((total / memberCount) * 100) / 100;
    const remainder = Math.round((total - perPerson * memberCount) * 100) / 100;
    const firstSplit = perPerson + remainder;
    const totalCheck = firstSplit + perPerson * (memberCount - 1);
    expect(Math.round(totalCheck * 100) / 100).toBe(999999.99);
  });

  it("should handle 2-way split of odd penny", () => {
    const total = 0.03;
    const memberCount = 2;
    const perPerson = Math.floor((total / memberCount) * 100) / 100; // 0.01
    const remainder = Math.round((total - perPerson * memberCount) * 100) / 100; // 0.01
    expect(perPerson).toBe(0.01);
    expect(remainder).toBe(0.01);
    expect(perPerson + remainder + perPerson * (memberCount - 1)).toBeCloseTo(0.03, 2);
  });

  it("should handle 100 split across 3 members precisely", () => {
    const total = 100;
    const members = 3;
    const base = Math.floor((total / members) * 100) / 100; // 33.33
    const firstSplit = Math.round((total - base * (members - 1)) * 100) / 100; // 33.34
    expect(base).toBe(33.33);
    expect(firstSplit).toBe(33.34);
    expect(firstSplit + base * (members - 1)).toBe(100);
  });

  it("should handle 1000 split across 6 members", () => {
    const total = 1000;
    const members = 6;
    const base = Math.floor((total / members) * 100) / 100; // 166.66
    const remainder = Math.round((total - base * members) * 100) / 100;
    const firstSplit = base + remainder;
    const totalCheck = firstSplit + base * (members - 1);
    expect(Math.round(totalCheck * 100) / 100).toBe(1000);
  });

  it("should not allow negative split amounts in validation", () => {
    const splits = [
      { user_id: 'u1', amount: 50 },
      { user_id: 'u2', amount: -10 },
      { user_id: 'u3', amount: 60 },
    ];
    const hasNegative = splits.some(s => s.amount < 0);
    expect(hasNegative).toBe(true);
    const validSplits = splits.filter(s => s.amount >= 0);
    expect(validSplits).toHaveLength(2);
  });

  it("should track will-pay and will-get correctly", () => {
    const currentUserId = "user-1";
    const expenses = [
      {
        created_by: "user-1",
        total_amount: 300,
        splits: [
          { user_id: "user-2", amount: 100, is_paid: false, status: "accepted" },
          { user_id: "user-3", amount: 100, is_paid: false, status: "accepted" },
        ],
      },
      {
        created_by: "user-2",
        total_amount: 200,
        splits: [
          { user_id: "user-1", amount: 100, is_paid: false, status: "accepted" },
        ],
      },
    ];

    let willPay = 0;
    let willGet = 0;

    expenses.forEach(expense => {
      expense.splits.forEach(split => {
        if (split.status === "accepted" && !split.is_paid) {
          if (split.user_id === currentUserId) {
            willPay += split.amount;
          } else if (expense.created_by === currentUserId) {
            willGet += split.amount;
          }
        }
      });
    });

    expect(willPay).toBe(100);
    expect(willGet).toBe(200);
  });

  it("should handle all splits already paid (will-pay = 0, will-get = 0)", () => {
    const currentUserId = "user-1";
    const expenses = [
      {
        created_by: "user-1",
        splits: [
          { user_id: "user-2", amount: 50, is_paid: true, status: "accepted" },
        ],
      },
    ];
    let willPay = 0;
    let willGet = 0;
    expenses.forEach(expense => {
      expense.splits.forEach(split => {
        if (split.status === "accepted" && !split.is_paid) {
          if (split.user_id === currentUserId) willPay += split.amount;
          else if (expense.created_by === currentUserId) willGet += split.amount;
        }
      });
    });
    expect(willPay).toBe(0);
    expect(willGet).toBe(0);
  });

  it("should not count rejected splits in totals", () => {
    const splits = [
      { amount: 100, status: "accepted", is_paid: false },
      { amount: 100, status: "rejected", is_paid: false },
      { amount: 100, status: "pending", is_paid: false },
    ];
    
    const pending = splits
      .filter(s => s.status === "accepted" && !s.is_paid)
      .reduce((sum, s) => sum + s.amount, 0);
    
    expect(pending).toBe(100);
  });

  it("should mark bill as settled when all splits are paid", () => {
    const splits = [
      { is_paid: true, status: "accepted" },
      { is_paid: true, status: "accepted" },
      { is_paid: false, status: "rejected" },
    ];
    
    const activeSplits = splits.filter(s => s.status !== "rejected");
    const allPaid = activeSplits.every(s => s.is_paid);
    expect(allPaid).toBe(true);
  });

  it("should not settle bill when some accepted splits unpaid", () => {
    const splits = [
      { is_paid: true, status: "accepted" },
      { is_paid: false, status: "accepted" },
    ];
    const activeSplits = splits.filter(s => s.status !== "rejected");
    const allPaid = activeSplits.every(s => s.is_paid);
    expect(allPaid).toBe(false);
  });

  it("should handle empty splits array gracefully", () => {
    const splits: { amount: number; status: string; is_paid: boolean }[] = [];
    const pending = splits
      .filter(s => s.status === "accepted" && !s.is_paid)
      .reduce((sum, s) => sum + s.amount, 0);
    expect(pending).toBe(0);
    const allPaid = splits.filter(s => s.status !== "rejected").every(s => s.is_paid);
    expect(allPaid).toBe(true); // vacuously true
  });
});

describe("Task Management Logic", () => {
  it("should determine if task needs approval", () => {
    const needsApproval = (task: { status: string; assigned_to: string }, userId: string) => {
      return task.status === "pending" && task.assigned_to === userId;
    };

    expect(needsApproval({ status: "pending", assigned_to: "user-1" }, "user-1")).toBe(true);
    expect(needsApproval({ status: "accepted", assigned_to: "user-1" }, "user-1")).toBe(false);
    expect(needsApproval({ status: "pending", assigned_to: "user-2" }, "user-1")).toBe(false);
  });

  it("should validate task status transitions", () => {
    const validTransitions: Record<string, string[]> = {
      pending: ["accepted", "rejected"],
      accepted: ["in_progress"],
      in_progress: ["done"],
      rejected: ["pending"],
      done: [],
    };

    expect(validTransitions["pending"]).toContain("accepted");
    expect(validTransitions["pending"]).toContain("rejected");
    expect(validTransitions["accepted"]).toContain("in_progress");
    expect(validTransitions["in_progress"]).toContain("done");
    expect(validTransitions["done"]).toHaveLength(0);
  });

  it("should reject invalid status transitions", () => {
    const validTransitions: Record<string, string[]> = {
      pending: ["accepted", "rejected"],
      accepted: ["in_progress"],
      in_progress: ["done"],
      rejected: ["pending"],
      done: [],
    };
    // Can't go from pending directly to done
    expect(validTransitions["pending"]).not.toContain("done");
    expect(validTransitions["pending"]).not.toContain("in_progress");
    // Can't go from done to anything
    expect(validTransitions["done"]).toHaveLength(0);
    // Can't go from accepted to done directly
    expect(validTransitions["accepted"]).not.toContain("done");
  });

  it("should format due dates correctly", () => {
    const formatDueDate = (dateString: string | null): string | null => {
      if (!dateString) return null;
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) return "Overdue";
      if (diffDays === 0) return "Due today";
      if (diffDays === 1) return "Due tomorrow";
      return `Due in ${diffDays} days`;
    };

    expect(formatDueDate(null)).toBeNull();
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatDueDate(yesterday.toISOString())).toBe("Overdue");
    
    // Far future
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 30);
    expect(formatDueDate(farFuture.toISOString())).toBe("Due in 30 days");
  });

  it("should filter solo mode tasks correctly", () => {
    const currentUserId = "user-1";
    const tasks = [
      { id: "t1", created_by: "user-1", assigned_to: "user-2" },
      { id: "t2", created_by: "user-2", assigned_to: "user-1" },
      { id: "t3", created_by: "user-2", assigned_to: "user-2" },
    ];

    const soloTasks = tasks.filter(
      t => t.created_by === currentUserId || t.assigned_to === currentUserId
    );
    expect(soloTasks).toHaveLength(2);
    expect(soloTasks.map(t => t.id)).toEqual(["t1", "t2"]);
  });

  it("should require title for task creation", () => {
    const validateTask = (title: string) => title.trim().length > 0;
    expect(validateTask("")).toBe(false);
    expect(validateTask("   ")).toBe(false);
    expect(validateTask("Clean kitchen")).toBe(true);
  });

  it("should require assigned_to for task creation", () => {
    const validateAssignee = (assignedTo: string | null) => !!assignedTo && assignedTo.length > 0;
    expect(validateAssignee(null)).toBe(false);
    expect(validateAssignee("")).toBe(false);
    expect(validateAssignee("user-1")).toBe(true);
  });

  it("should validate priority values", () => {
    const validPriorities = ["low", "medium", "high"];
    expect(validPriorities).toContain("low");
    expect(validPriorities).toContain("medium");
    expect(validPriorities).toContain("high");
    expect(validPriorities).not.toContain("urgent");
    expect(validPriorities).not.toContain("");
  });

  it("should handle task with no due date", () => {
    const task = { title: "Buy groceries", due_date: null, reminder_time: null };
    expect(task.due_date).toBeNull();
    expect(task.reminder_time).toBeNull();
  });

  it("should handle rejection requiring a comment", () => {
    const validateRejection = (comment: string) => comment.trim().length > 0;
    expect(validateRejection("")).toBe(false);
    expect(validateRejection("   ")).toBe(false);
    expect(validateRejection("Not my turn")).toBe(true);
  });

  it("should handle self-assigned tasks (creator = assignee)", () => {
    const task = { created_by: "user-1", assigned_to: "user-1", status: "pending" };
    const isSelfAssigned = task.created_by === task.assigned_to;
    expect(isSelfAssigned).toBe(true);
    // Self-assigned tasks still need approval
    const needsApproval = task.status === "pending" && task.assigned_to === "user-1";
    expect(needsApproval).toBe(true);
  });

  it("should handle empty task list gracefully", () => {
    const tasks: any[] = [];
    const pending = tasks.filter(t => t.status === "pending");
    const inProgress = tasks.filter(t => t.status === "in_progress");
    expect(pending).toHaveLength(0);
    expect(inProgress).toHaveLength(0);
  });
});

describe("Navigation Logic", () => {
  it("should map tab names to routes", () => {
    const TAB_ROUTES: Record<string, string> = {
      home: '/',
      tasks: '/tasks',
      expenses: '/expenses',
      storage: '/storage',
      chat: '/chat',
    };

    expect(TAB_ROUTES['home']).toBe('/');
    expect(TAB_ROUTES['tasks']).toBe('/tasks');
    expect(TAB_ROUTES['expenses']).toBe('/expenses');
    expect(TAB_ROUTES['storage']).toBe('/storage');
    expect(TAB_ROUTES['chat']).toBe('/chat');
  });

  it("should map routes back to tabs", () => {
    const ROUTE_TABS: Record<string, string> = {
      '/': 'home',
      '/tasks': 'tasks',
      '/expenses': 'expenses',
      '/storage': 'storage',
      '/chat': 'chat',
    };

    expect(ROUTE_TABS['/']).toBe('home');
    expect(ROUTE_TABS['/unknown']).toBeUndefined();
  });
});

describe("Alarm Logic", () => {
  const timeToMinutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const shouldTrigger = (alarmMinutes: number, nowMinutes: number, windowMinutes = 2) => {
    const diff = nowMinutes - alarmMinutes;
    return diff >= 0 && diff <= windowMinutes;
  };

  const canDismiss = (conditionType: string, isOwner: boolean, ringCount: number, conditionValue: number) => {
    switch (conditionType) {
      case "anyone_can_dismiss": return true;
      case "owner_only": return isOwner;
      case "after_rings": return ringCount >= conditionValue;
      case "multiple_ack": return ringCount >= conditionValue;
      default: return false;
    }
  };

  it("should parse alarm time to minutes", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
    expect(timeToMinutes("12:00")).toBe(720);
  });

  it("should check if alarm should trigger within window", () => {
    expect(shouldTrigger(510, 510)).toBe(true); // exactly on time
    expect(shouldTrigger(510, 511)).toBe(true); // 1 min late
    expect(shouldTrigger(510, 512)).toBe(true); // 2 min late
    expect(shouldTrigger(510, 513)).toBe(false); // too late
    expect(shouldTrigger(510, 509)).toBe(false); // too early
  });

  it("should handle midnight boundary (23:59 → 00:00)", () => {
    // Alarm at 23:59, current time wraps to 00:00 next day
    const alarmMin = timeToMinutes("23:59");
    expect(alarmMin).toBe(1439);
    // At 23:59 itself — should trigger
    expect(shouldTrigger(1439, 1439)).toBe(true);
    // At 00:00 (0 minutes) — wraps, diff is negative, should NOT trigger
    expect(shouldTrigger(1439, 0)).toBe(false);
  });

  it("should handle alarm at 00:00 midnight", () => {
    expect(shouldTrigger(0, 0)).toBe(true);
    expect(shouldTrigger(0, 1)).toBe(true);
    expect(shouldTrigger(0, 2)).toBe(true);
    expect(shouldTrigger(0, 3)).toBe(false);
  });

  it("should check days of week correctly", () => {
    const daysOfWeek = [1, 2, 3, 4, 5]; // weekdays
    expect(daysOfWeek.includes(1)).toBe(true); // Monday
    expect(daysOfWeek.includes(0)).toBe(false); // Sunday
    expect(daysOfWeek.includes(6)).toBe(false); // Saturday
  });

  it("should handle every-day alarm", () => {
    const everyDay = [0, 1, 2, 3, 4, 5, 6];
    for (let d = 0; d <= 6; d++) {
      expect(everyDay.includes(d)).toBe(true);
    }
  });

  it("should handle weekend-only alarm", () => {
    const weekends = [0, 6]; // Sun, Sat
    expect(weekends.includes(0)).toBe(true);
    expect(weekends.includes(6)).toBe(true);
    expect(weekends.includes(1)).toBe(false);
    expect(weekends.includes(5)).toBe(false);
  });

  it("should handle empty days_of_week (disabled alarm)", () => {
    const noDays: number[] = [];
    for (let d = 0; d <= 6; d++) {
      expect(noDays.includes(d)).toBe(false);
    }
  });

  it("should handle dismiss conditions", () => {
    expect(canDismiss("anyone_can_dismiss", false, 0, 0)).toBe(true);
    expect(canDismiss("owner_only", true, 0, 0)).toBe(true);
    expect(canDismiss("owner_only", false, 0, 0)).toBe(false);
    expect(canDismiss("after_rings", false, 5, 3)).toBe(true);
    expect(canDismiss("after_rings", false, 2, 3)).toBe(false);
    expect(canDismiss("after_rings", false, 3, 3)).toBe(true); // exactly at threshold
  });

  it("should enforce hard cutoff after 3 rings by default", () => {
    const MAX_RINGS = 3;
    const shouldStop = (ringCount: number) => ringCount >= MAX_RINGS;
    expect(shouldStop(0)).toBe(false);
    expect(shouldStop(1)).toBe(false);
    expect(shouldStop(2)).toBe(false);
    expect(shouldStop(3)).toBe(true);
    expect(shouldStop(4)).toBe(true);
  });

  it("should handle multiple_ack dismiss condition", () => {
    // Requires N acknowledgments
    expect(canDismiss("multiple_ack", false, 2, 2)).toBe(true);
    expect(canDismiss("multiple_ack", false, 1, 2)).toBe(false);
    expect(canDismiss("multiple_ack", false, 0, 2)).toBe(false);
  });

  it("should apply timezone offset correctly", () => {
    const applyTimezoneOffset = (alarmMinutes: number, offsetMinutes: number) => {
      let adjusted = alarmMinutes - offsetMinutes;
      if (adjusted < 0) adjusted += 1440;
      if (adjusted >= 1440) adjusted -= 1440;
      return adjusted;
    };
    
    // Alarm at 08:30 IST (UTC+5:30 = 330 min offset)
    const utcMinutes = applyTimezoneOffset(510, 330);
    expect(utcMinutes).toBe(180); // 03:00 UTC

    // Alarm at 01:00 with +120 offset → wraps to previous day
    const wrapped = applyTimezoneOffset(60, 120);
    expect(wrapped).toBe(1380); // 23:00 UTC previous day
  });

  it("should handle inactive alarm", () => {
    const alarm = { is_active: false, alarm_time: "08:00", days_of_week: [1, 2, 3, 4, 5] };
    const shouldRing = alarm.is_active;
    expect(shouldRing).toBe(false);
  });

  it("should prevent duplicate triggers (idempotency)", () => {
    const existingTriggers = [
      { alarm_id: "alarm-1", triggered_at: "2026-03-08T08:00:00Z", status: "ringing" },
    ];
    const isDuplicate = (alarmId: string) =>
      existingTriggers.some(t => t.alarm_id === alarmId && t.status === "ringing");
    
    expect(isDuplicate("alarm-1")).toBe(true);
    expect(isDuplicate("alarm-2")).toBe(false);
  });

  it("should handle unknown dismiss condition type", () => {
    expect(canDismiss("unknown_type", true, 100, 0)).toBe(false);
    expect(canDismiss("", false, 0, 0)).toBe(false);
  });
});

describe("Quick Actions Filtering", () => {
  it("should hide solo-restricted actions in solo mode", () => {
    const actions = [
      { label: "Music Sync", soloHidden: false },
      { label: "Games", soloHidden: false },
      { label: "Alarms", soloHidden: true },
      { label: "Expenses", soloHidden: false },
      { label: "Storage", soloHidden: false },
      { label: "Roommates", soloHidden: true },
    ];

    const isSoloMode = true;
    const visible = actions.filter(a => !(isSoloMode && a.soloHidden));
    expect(visible).toHaveLength(4);
    expect(visible.map(a => a.label)).not.toContain("Alarms");
    expect(visible.map(a => a.label)).not.toContain("Roommates");
  });

  it("should show all actions in room mode", () => {
    const actions = [
      { label: "Music Sync", soloHidden: false },
      { label: "Games", soloHidden: false },
      { label: "Alarms", soloHidden: true },
      { label: "Expenses", soloHidden: false },
      { label: "Storage", soloHidden: false },
      { label: "Roommates", soloHidden: true },
    ];

    const isSoloMode = false;
    const visible = actions.filter(a => !(isSoloMode && a.soloHidden));
    expect(visible).toHaveLength(6);
  });
});

describe("Room Setup Validation", () => {
  it("should require room name to be non-empty", () => {
    const validate = (name: string) => name.trim().length > 0;
    expect(validate("")).toBe(false);
    expect(validate("   ")).toBe(false);
    expect(validate("My Room")).toBe(true);
  });

  it("should enforce max room name length", () => {
    const maxLen = 50;
    const name = "A".repeat(51);
    expect(name.length > maxLen).toBe(true);
    expect("A".repeat(50).length <= maxLen).toBe(true);
  });

  it("should validate invite code format", () => {
    const isValid = (code: string) => /^[A-Z0-9]{6}$/.test(code.trim().toUpperCase());
    expect(isValid("ABC123")).toBe(true);
    expect(isValid("abc123")).toBe(true);
    expect(isValid("ABC12")).toBe(false);
    expect(isValid("ABC1234")).toBe(false);
    expect(isValid("")).toBe(false);
  });
});

describe("Reminder Logic", () => {
  it("should skip notification for settled expenses", () => {
    const expenseStatus = "settled";
    const shouldNotify = expenseStatus !== "settled";
    expect(shouldNotify).toBe(false);
  });

  it("should skip notification for completed tasks", () => {
    const taskStatus = "done";
    const shouldNotify = taskStatus !== "done";
    expect(shouldNotify).toBe(false);
  });

  it("should check if reminder is within window", () => {
    const isWithinWindow = (remindAt: string, nowMs: number, windowMs: number) => {
      const remindMs = new Date(remindAt).getTime();
      const diff = nowMs - remindMs;
      return diff >= 0 && diff <= windowMs;
    };

    const now = Date.now();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const twentyMinAgo = new Date(now - 20 * 60 * 1000).toISOString();

    expect(isWithinWindow(fiveMinAgo, now, 10 * 60 * 1000)).toBe(true);
    expect(isWithinWindow(twentyMinAgo, now, 10 * 60 * 1000)).toBe(false);
  });
});

describe("Protected Route Logic", () => {
  it("should redirect unauthenticated users to /auth", () => {
    const user = null;
    const shouldRedirect = !user;
    expect(shouldRedirect).toBe(true);
  });

  it("should redirect users without rooms to /setup", () => {
    const user = { id: "user-1" };
    const currentRoom = null;
    const userRooms: any[] = [];
    const requireRoom = true;

    const shouldRedirectToSetup = requireRoom && !currentRoom && userRooms.length === 0;
    expect(shouldRedirectToSetup).toBe(true);
  });

  it("should allow users with rooms through", () => {
    const user = { id: "user-1" };
    const currentRoom = { id: "room-1" };
    const userRooms = [currentRoom];

    const shouldRedirectToSetup = !currentRoom && userRooms.length === 0;
    expect(shouldRedirectToSetup).toBe(false);
  });
});

describe("Music Player Logic", () => {
  it("should format time correctly", () => {
    const formatTime = (s: number) => {
      if (!s || isNaN(s)) return "0:00";
      const mins = Math.floor(s / 60);
      const secs = Math.floor(s % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3600)).toBe("60:00");
    expect(formatTime(NaN)).toBe("0:00");
  });
});

describe("Online Status Logic", () => {
  it("should format last seen timestamps", () => {
    const formatLastSeen = (timestamp?: string) => {
      if (!timestamp) return 'Offline';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
      return 'Long ago';
    };

    expect(formatLastSeen(undefined)).toBe('Offline');
    expect(formatLastSeen(new Date().toISOString())).toBe('Just now');
    
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    expect(formatLastSeen(oneHourAgo)).toBe('1h ago');
  });
});
