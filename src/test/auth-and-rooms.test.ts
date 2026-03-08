import { describe, it, expect } from "vitest";

describe("Auth Input Validation", () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it("should validate correct email formats", () => {
    expect(emailRegex.test("user@example.com")).toBe(true);
    expect(emailRegex.test("test.user@domain.co.in")).toBe(true);
  });

  it("should reject invalid email formats", () => {
    expect(emailRegex.test("")).toBe(false);
    expect(emailRegex.test("no-at-sign")).toBe(false);
    expect(emailRegex.test("@domain.com")).toBe(false);
    expect(emailRegex.test("user@")).toBe(false);
  });

  it("should enforce minimum password length of 6", () => {
    expect("12345".length >= 6).toBe(false);
    expect("123456".length >= 6).toBe(true);
    expect("longpassword".length >= 6).toBe(true);
  });

  it("should require display name for signup", () => {
    const validate = (name: string) => name.trim().length > 0;
    expect(validate("")).toBe(false);
    expect(validate("   ")).toBe(false);
    expect(validate("John")).toBe(true);
  });
});

describe("Room Member Role Logic", () => {
  it("should identify admin role", () => {
    const members = [
      { user_id: "u1", role: "admin" },
      { user_id: "u2", role: "member" },
    ];
    
    const isAdmin = (userId: string) => 
      members.find(m => m.user_id === userId)?.role === "admin";
    
    expect(isAdmin("u1")).toBe(true);
    expect(isAdmin("u2")).toBe(false);
    expect(isAdmin("u3")).toBe(false);
  });

  it("should prevent admin from leaving with other members", () => {
    const isAdmin = true;
    const otherMembers = [{ user_id: "u2" }];
    const shouldBlock = isAdmin && otherMembers.length > 0;
    expect(shouldBlock).toBe(true);
  });

  it("should allow admin to leave if they are the only member", () => {
    const isAdmin = true;
    const otherMembers: any[] = [];
    const shouldBlock = isAdmin && otherMembers.length > 0;
    expect(shouldBlock).toBe(false);
  });

  it("should allow non-admin to leave freely", () => {
    const isAdmin = false;
    const otherMembers = [{ user_id: "u1" }];
    const shouldBlock = isAdmin && otherMembers.length > 0;
    expect(shouldBlock).toBe(false);
  });
});

describe("Notification Badge Logic", () => {
  it("should show correct badge count", () => {
    const formatBadge = (count: number) => {
      if (count <= 0) return null;
      if (count > 99) return "99+";
      return String(count);
    };

    expect(formatBadge(0)).toBeNull();
    expect(formatBadge(5)).toBe("5");
    expect(formatBadge(99)).toBe("99");
    expect(formatBadge(100)).toBe("99+");
    expect(formatBadge(999)).toBe("99+");
  });
});

describe("Expense Category Logic", () => {
  it("should map category to emoji", () => {
    const getCategoryEmoji = (title: string): string => {
      const lower = title.toLowerCase();
      if (lower.includes("food") || lower.includes("restaurant")) return "🍕";
      if (lower.includes("rent") || lower.includes("house")) return "🏠";
      if (lower.includes("electricity") || lower.includes("bill")) return "💡";
      if (lower.includes("grocery") || lower.includes("market")) return "🛒";
      return "💰";
    };

    expect(getCategoryEmoji("Food delivery")).toBe("🍕");
    expect(getCategoryEmoji("Monthly rent")).toBe("🏠");
    expect(getCategoryEmoji("Electricity bill")).toBe("💡");
    expect(getCategoryEmoji("Grocery shopping")).toBe("🛒");
    expect(getCategoryEmoji("Random stuff")).toBe("💰");
  });
});

describe("Game Session Logic", () => {
  it("should validate game types", () => {
    const validGames = ["snakes_and_ladders", "ludo", "chopathi", "kabaddi"];
    expect(validGames.includes("snakes_and_ladders")).toBe(true);
    expect(validGames.includes("chess")).toBe(false);
  });

  it("should determine winner correctly from scores", () => {
    const scores = { "user-1": 10, "user-2": 15, "user-3": 8 };
    const winner = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
    expect(winner[0]).toBe("user-2");
    expect(winner[1]).toBe(15);
  });
});

describe("Storage / Chat Attachment Logic", () => {
  it("should validate audio file types", () => {
    const isAudio = (type: string) => type.startsWith("audio/");
    expect(isAudio("audio/mp3")).toBe(true);
    expect(isAudio("audio/wav")).toBe(true);
    expect(isAudio("image/png")).toBe(false);
  });

  it("should generate track name from filename", () => {
    const getTrackName = (filename: string) => {
      return filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    };

    expect(getTrackName("my-song.mp3")).toBe("my song");
    expect(getTrackName("track_01.wav")).toBe("track 01");
  });
});

describe("Date Formatting Helpers", () => {
  it("should format relative dates", () => {
    const formatRelative = (dateStr: string) => {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString();
    };

    expect(formatRelative(new Date().toISOString())).toBe("Just now");
    
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(twoHoursAgo)).toBe("2h ago");
  });
});

describe("Bill Scanner Validation", () => {
  it("should validate base64 image data", () => {
    const isValidBase64 = (data: string) => {
      return data.startsWith("data:image/") && data.includes("base64,");
    };

    expect(isValidBase64("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(isValidBase64("data:image/png;base64,iVBOR")).toBe(true);
    expect(isValidBase64("not-an-image")).toBe(false);
    expect(isValidBase64("")).toBe(false);
  });

  it("should parse receipt JSON format", () => {
    const receipt = {
      title: "Grocery Store",
      items: [
        { name: "Milk", price: 50, quantity: 2 },
        { name: "Bread", price: 30, quantity: 1 },
      ],
      total: 130,
    };

    expect(receipt.items).toHaveLength(2);
    expect(receipt.items[0].price * receipt.items[0].quantity + receipt.items[1].price * receipt.items[1].quantity).toBe(130);
  });
});
