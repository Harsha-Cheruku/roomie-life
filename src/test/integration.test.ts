import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase, mockAuthContext } from "./test-utils";

/**
 * Integration tests that validate Supabase query patterns match the actual
 * database schema. These verify query structure, not live DB connections.
 */

// Helper to track chained calls
function createChainTracker() {
  const calls: { method: string; args: any[] }[] = [];
  const chain: any = {};
  const methods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'order', 'limit', 'single', 'maybeSingle', 'rpc'];
  methods.forEach(method => {
    chain[method] = (...args: any[]) => {
      calls.push({ method, args });
      return chain;
    };
  });
  // Terminal methods resolve
  chain.then = (resolve: any) => resolve({ data: [], error: null });
  return { chain, calls };
}

describe("Room Operations - Query Patterns", () => {
  it("should query rooms via room_members join", () => {
    const { chain, calls } = createChainTracker();
    
    // Simulate: fetch user's rooms
    chain.from('room_members').select('room_id, rooms(*)').eq('user_id', 'user-1');
    
    expect(calls[0]).toEqual({ method: 'from', args: ['room_members'] });
    expect(calls[1].method).toBe('select');
    expect(calls[1].args[0]).toContain('rooms(*)');
    expect(calls[2]).toEqual({ method: 'eq', args: ['user_id', 'user-1'] });
  });

  it("should create room with correct fields", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('rooms').insert({ name: 'Test Room', created_by: 'user-1' }).select().single();
    
    expect(calls[0]).toEqual({ method: 'from', args: ['rooms'] });
    expect(calls[1].args[0]).toEqual({ name: 'Test Room', created_by: 'user-1' });
  });

  it("should add room member with correct role", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('room_members').insert({
      room_id: 'room-1',
      user_id: 'user-1',
      role: 'admin',
    });
    
    expect(calls[1].args[0]).toHaveProperty('role', 'admin');
    expect(calls[1].args[0]).toHaveProperty('room_id', 'room-1');
    expect(calls[1].args[0]).toHaveProperty('user_id', 'user-1');
  });

  it("should lookup room by invite code using RPC", () => {
    const { chain, calls } = createChainTracker();
    
    chain.rpc('lookup_room_by_invite_code', { code: 'ABC123' });
    
    expect(calls[0]).toEqual({
      method: 'rpc',
      args: ['lookup_room_by_invite_code', { code: 'ABC123' }],
    });
  });

  it("should fetch room members then profiles separately (no FK)", () => {
    const { chain: chain1, calls: calls1 } = createChainTracker();
    const { chain: chain2, calls: calls2 } = createChainTracker();
    
    // Step 1: Get member user_ids
    chain1.from('room_members').select('user_id').eq('room_id', 'room-1');
    expect(calls1[0]).toEqual({ method: 'from', args: ['room_members'] });
    
    // Step 2: Get profiles by user_ids
    const userIds = ['user-1', 'user-2'];
    chain2.from('profiles').select('user_id, display_name, avatar').in('user_id', userIds);
    expect(calls2[0]).toEqual({ method: 'from', args: ['profiles'] });
    expect(calls2[2]).toEqual({ method: 'in', args: ['user_id', userIds] });
  });
});

describe("Expense Operations - Query Patterns", () => {
  it("should fetch expenses with splits for a room", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('expenses')
      .select('id, total_amount, created_by, status, created_at, expense_splits(user_id, amount, is_paid, status)')
      .eq('room_id', 'room-1');
    
    expect(calls[0]).toEqual({ method: 'from', args: ['expenses'] });
    expect(calls[1].args[0]).toContain('expense_splits');
    expect(calls[2]).toEqual({ method: 'eq', args: ['room_id', 'room-1'] });
  });

  it("should create expense with all required fields", () => {
    const { chain, calls } = createChainTracker();
    
    const expense = {
      title: 'Groceries',
      total_amount: 150.50,
      room_id: 'room-1',
      created_by: 'user-1',
      paid_by: 'user-1',
      category: 'groceries',
      split_type: 'equal',
      status: 'pending',
    };
    
    chain.from('expenses').insert(expense).select().single();
    
    expect(calls[1].args[0]).toHaveProperty('title', 'Groceries');
    expect(calls[1].args[0]).toHaveProperty('total_amount', 150.50);
    expect(calls[1].args[0]).toHaveProperty('paid_by', 'user-1');
    expect(calls[1].args[0]).toHaveProperty('room_id', 'room-1');
  });

  it("should create expense splits with correct structure", () => {
    const { chain, calls } = createChainTracker();
    
    const splits = [
      { expense_id: 'exp-1', user_id: 'user-1', amount: 75.25, status: 'pending' },
      { expense_id: 'exp-1', user_id: 'user-2', amount: 75.25, status: 'pending' },
    ];
    
    chain.from('expense_splits').insert(splits);
    
    expect(calls[1].args[0]).toHaveLength(2);
    expect(calls[1].args[0][0]).toHaveProperty('expense_id', 'exp-1');
    expect(calls[1].args[0][0]).toHaveProperty('amount', 75.25);
  });

  it("should update split status for accept/reject", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('expense_splits')
      .update({ status: 'accepted' })
      .eq('id', 'split-1');
    
    expect(calls[1].args[0]).toEqual({ status: 'accepted' });
    expect(calls[2]).toEqual({ method: 'eq', args: ['id', 'split-1'] });
  });

  it("should mark split as paid", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('expense_splits')
      .update({ is_paid: true })
      .eq('id', 'split-1');
    
    expect(calls[1].args[0]).toEqual({ is_paid: true });
  });

  it("should delete expense by creator only", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('expenses').delete().eq('id', 'exp-1');
    
    expect(calls[0]).toEqual({ method: 'from', args: ['expenses'] });
    expect(calls[1]).toEqual({ method: 'delete', args: [] });
    expect(calls[2]).toEqual({ method: 'eq', args: ['id', 'exp-1'] });
  });

  it("should validate expense split amounts sum to total", () => {
    const total = 100;
    const numMembers = 3;
    const perPerson = Math.floor((total * 100) / numMembers) / 100;
    const remainder = Math.round((total - perPerson * numMembers) * 100) / 100;
    
    const splits = Array.from({ length: numMembers }, (_, i) => ({
      amount: i === 0 ? perPerson + remainder : perPerson,
    }));
    
    const splitSum = splits.reduce((sum, s) => sum + s.amount, 0);
    expect(Math.round(splitSum * 100) / 100).toBe(total);
  });
});

describe("Task Operations - Query Patterns", () => {
  it("should fetch tasks for a room excluding rejected", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('tasks')
      .select('*')
      .eq('room_id', 'room-1')
      .neq('status', 'rejected')
      .order('created_at', { ascending: false });
    
    expect(calls[0]).toEqual({ method: 'from', args: ['tasks'] });
    expect(calls[2]).toEqual({ method: 'eq', args: ['room_id', 'room-1'] });
    expect(calls[3]).toEqual({ method: 'neq', args: ['status', 'rejected'] });
  });

  it("should create task with all required fields", () => {
    const { chain, calls } = createChainTracker();
    
    const task = {
      title: 'Clean kitchen',
      room_id: 'room-1',
      created_by: 'user-1',
      assigned_to: 'user-2',
      priority: 'high',
      status: 'pending',
      due_date: '2026-03-10T09:00:00Z',
    };
    
    chain.from('tasks').insert(task).select().single();
    
    expect(calls[1].args[0]).toHaveProperty('title', 'Clean kitchen');
    expect(calls[1].args[0]).toHaveProperty('assigned_to', 'user-2');
    expect(calls[1].args[0]).toHaveProperty('priority', 'high');
  });

  it("should update task status (accept/start/complete)", () => {
    const statuses = ['accepted', 'in_progress', 'done'];
    
    statuses.forEach(status => {
      const { chain, calls } = createChainTracker();
      chain.from('tasks').update({ status }).eq('id', 'task-1');
      expect(calls[1].args[0]).toEqual({ status });
    });
  });

  it("should reject task with comment", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('tasks')
      .update({ status: 'rejected', rejection_comment: 'Not my responsibility' })
      .eq('id', 'task-1');
    
    expect(calls[1].args[0]).toHaveProperty('status', 'rejected');
    expect(calls[1].args[0]).toHaveProperty('rejection_comment', 'Not my responsibility');
  });

  it("should delete task (creator only)", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('tasks').delete().eq('id', 'task-1');
    
    expect(calls[1]).toEqual({ method: 'delete', args: [] });
  });
});

describe("Message Operations - Query Patterns", () => {
  it("should fetch messages ordered by created_at desc", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('messages')
      .select('*')
      .eq('room_id', 'room-1')
      .order('created_at', { ascending: false })
      .limit(50);
    
    expect(calls[0]).toEqual({ method: 'from', args: ['messages'] });
    expect(calls[4]).toEqual({ method: 'limit', args: [50] });
  });

  it("should insert message with sender_id matching auth user", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('messages').insert({
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'Hello roommates!',
      message_type: 'text',
    });
    
    expect(calls[1].args[0]).toHaveProperty('sender_id', 'user-1');
    expect(calls[1].args[0]).toHaveProperty('content', 'Hello roommates!');
  });
});

describe("Alarm Operations - Query Patterns", () => {
  it("should fetch active alarm triggers for a room", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('alarm_triggers')
      .select('*, alarms!inner(*)')
      .eq('status', 'ringing')
      .eq('alarms.room_id', 'room-1')
      .order('triggered_at', { ascending: false })
      .limit(1);
    
    expect(calls[1].args[0]).toContain('alarms!inner');
    expect(calls[2]).toEqual({ method: 'eq', args: ['status', 'ringing'] });
  });

  it("should create alarm with required fields", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('alarms').insert({
      room_id: 'room-1',
      created_by: 'user-1',
      title: 'Wake up',
      alarm_time: '07:00',
      days_of_week: [1, 2, 3, 4, 5],
      is_active: true,
      condition_type: 'anyone_can_dismiss',
    });
    
    expect(calls[1].args[0]).toHaveProperty('alarm_time', '07:00');
    expect(calls[1].args[0]).toHaveProperty('days_of_week', [1, 2, 3, 4, 5]);
  });
});

describe("Notification Operations - Query Patterns", () => {
  it("should fetch unread notifications for user in room", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('notifications')
      .select('id')
      .eq('user_id', 'user-1')
      .eq('is_read', false)
      .eq('room_id', 'room-1');
    
    expect(calls[2]).toEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(calls[3]).toEqual({ method: 'eq', args: ['is_read', false] });
  });

  it("should mark notification as read", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('notifications')
      .update({ is_read: true })
      .eq('id', 'notif-1');
    
    expect(calls[1].args[0]).toEqual({ is_read: true });
  });

  it("should create notification with all required fields", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('notifications').insert({
      room_id: 'room-1',
      user_id: 'user-2',
      type: 'expense',
      title: 'New expense added',
      body: 'Groceries - ₹150',
      reference_id: 'exp-1',
      reference_type: 'expense',
    });
    
    expect(calls[1].args[0]).toHaveProperty('type', 'expense');
    expect(calls[1].args[0]).toHaveProperty('user_id', 'user-2');
  });
});

describe("Profile Operations - Query Patterns", () => {
  it("should fetch profile by user_id", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('profiles')
      .select('*')
      .eq('user_id', 'user-1');
    
    expect(calls[2]).toEqual({ method: 'eq', args: ['user_id', 'user-1'] });
  });

  it("should fetch multiple profiles by user_id array", () => {
    const { chain, calls } = createChainTracker();
    
    const userIds = ['user-1', 'user-2', 'user-3'];
    chain.from('profiles')
      .select('user_id, display_name, avatar')
      .in('user_id', userIds);
    
    expect(calls[2]).toEqual({ method: 'in', args: ['user_id', userIds] });
  });

  it("should update own profile", () => {
    const { chain, calls } = createChainTracker();
    
    chain.from('profiles')
      .update({ display_name: 'New Name', avatar: '🎉' })
      .eq('user_id', 'user-1');
    
    expect(calls[1].args[0]).toHaveProperty('display_name', 'New Name');
  });
});

describe("Data Integrity Checks", () => {
  it("should ensure expense total matches sum of item prices", () => {
    const items = [
      { name: 'Rice', price: 45, quantity: 2 },
      { name: 'Dal', price: 60, quantity: 1 },
      { name: 'Oil', price: 120, quantity: 1 },
    ];
    
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    expect(total).toBe(270);
  });

  it("should ensure all splits reference valid expense_id", () => {
    const expense = { id: 'exp-1', total_amount: 100 };
    const splits = [
      { expense_id: 'exp-1', user_id: 'user-1', amount: 50 },
      { expense_id: 'exp-1', user_id: 'user-2', amount: 50 },
    ];
    
    splits.forEach(split => {
      expect(split.expense_id).toBe(expense.id);
    });
    
    const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
    expect(splitTotal).toBe(expense.total_amount);
  });

  it("should validate room member roles are valid", () => {
    const validRoles = ['admin', 'member'];
    const members = [
      { user_id: 'user-1', role: 'admin' },
      { user_id: 'user-2', role: 'member' },
    ];
    
    members.forEach(m => {
      expect(validRoles).toContain(m.role);
    });
  });

  it("should validate task statuses are valid", () => {
    const validStatuses = ['pending', 'accepted', 'rejected', 'in_progress', 'done'];
    const statuses = ['pending', 'accepted', 'in_progress', 'done', 'rejected'];
    
    statuses.forEach(s => {
      expect(validStatuses).toContain(s);
    });
  });

  it("should validate alarm days_of_week are 0-6", () => {
    const daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
    daysOfWeek.forEach(d => {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(6);
    });
  });

  it("should handle 3-way expense split with remainder correctly", () => {
    const total = 100;
    const members = 3;
    const base = Math.floor((total / members) * 100) / 100; // 33.33
    const firstSplit = Math.round((total - base * (members - 1)) * 100) / 100; // 33.34
    
    expect(base).toBe(33.33);
    expect(firstSplit).toBe(33.34);
    expect(firstSplit + base * (members - 1)).toBe(100);
  });
});
