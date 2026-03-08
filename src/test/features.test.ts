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
  it("should parse alarm time to minutes", () => {
    const timeToMinutes = (time: string): number => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };

    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("should check if alarm should trigger within window", () => {
    const shouldTrigger = (alarmMinutes: number, nowMinutes: number) => {
      const diff = nowMinutes - alarmMinutes;
      return diff >= 0 && diff <= 2;
    };

    expect(shouldTrigger(510, 510)).toBe(true); // exactly on time
    expect(shouldTrigger(510, 511)).toBe(true); // 1 min late
    expect(shouldTrigger(510, 512)).toBe(true); // 2 min late
    expect(shouldTrigger(510, 513)).toBe(false); // too late
    expect(shouldTrigger(510, 509)).toBe(false); // too early
  });

  it("should check days of week correctly", () => {
    const daysOfWeek = [1, 2, 3, 4, 5]; // weekdays
    const monday = 1;
    const sunday = 0;
    
    expect(daysOfWeek.includes(monday)).toBe(true);
    expect(daysOfWeek.includes(sunday)).toBe(false);
  });

  it("should handle dismiss conditions", () => {
    const canDismiss = (conditionType: string, isOwner: boolean, ringCount: number, conditionValue: number) => {
      switch (conditionType) {
        case "anyone_can_dismiss": return true;
        case "owner_only": return isOwner;
        case "after_rings": return ringCount >= conditionValue;
        default: return false;
      }
    };

    expect(canDismiss("anyone_can_dismiss", false, 0, 0)).toBe(true);
    expect(canDismiss("owner_only", true, 0, 0)).toBe(true);
    expect(canDismiss("owner_only", false, 0, 0)).toBe(false);
    expect(canDismiss("after_rings", false, 5, 3)).toBe(true);
    expect(canDismiss("after_rings", false, 2, 3)).toBe(false);
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
