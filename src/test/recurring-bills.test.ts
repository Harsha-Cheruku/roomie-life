import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * End-to-end integration test for the Recurring Bills feature.
 *
 * Simulates:
 *  1. User creating a recurring_bills template + recurring_bill_splits.
 *  2. The scheduled `process-recurring-bills` edge function running.
 *  3. Idempotency: a second invocation on the same run_date must NOT
 *     create duplicate expenses or splits.
 *
 * We mock the Supabase client and emulate the unique constraint on
 * (recurring_bill_id, run_date) in `recurring_bill_runs` so the second
 * run is skipped exactly the way the real DB would skip it.
 */

type Row = Record<string, any>;

function createInMemoryDb() {
  const tables: Record<string, Row[]> = {
    recurring_bills: [],
    recurring_bill_splits: [],
    recurring_bill_runs: [],
    expenses: [],
    expense_splits: [],
    notifications: [],
  };

  // unique (recurring_bill_id, run_date) on recurring_bill_runs
  function insert(table: string, rows: Row | Row[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    if (table === "recurring_bill_runs") {
      for (const r of list) {
        const dup = tables[table].find(
          (x) => x.recurring_bill_id === r.recurring_bill_id && x.run_date === r.run_date,
        );
        if (dup) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
      }
    }
    const inserted = list.map((r) => ({ id: `${table}-${tables[table].length + 1}`, ...r }));
    tables[table].push(...inserted);
    return { data: inserted, error: null };
  }

  return { tables, insert };
}

function makeMockClient(db: ReturnType<typeof createInMemoryDb>) {
  return {
    from(table: string) {
      const state: any = { table, filters: [] as Array<[string, any]>, lteFilters: [] as Array<[string, any]> };
      const api: any = {
        select(_cols?: string) {
          state.select = true;
          return api;
        },
        eq(col: string, val: any) {
          state.filters.push([col, val]);
          return api;
        },
        lte(col: string, val: any) {
          state.lteFilters.push([col, val]);
          return api;
        },
        single() {
          state.single = true;
          return runSelect();
        },
        insert(rows: Row | Row[]) {
          const res = db.insert(table, rows);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: res.data?.[0] ?? null, error: res.error });
                },
              };
            },
            then: (resolve: any) => resolve(res),
          };
        },
        update(patch: Row) {
          state.update = patch;
          return {
            eq(col: string, val: any) {
              state.filters.push([col, val]);
              return {
                eq(col2: string, val2: any) {
                  state.filters.push([col2, val2]);
                  return runUpdate();
                },
                then: (resolve: any) => resolve(runUpdate()),
              };
            },
          };
        },
        then: (resolve: any) => resolve(runSelect()),
      };

      function runSelect() {
        let rows = db.tables[table].filter((r) =>
          state.filters.every(([c, v]: [string, any]) => r[c] === v) &&
          state.lteFilters.every(([c, v]: [string, any]) => r[c] <= v),
        );
        // Emulate `recurring_bill_splits(user_id, amount)` join
        if (table === "recurring_bills") {
          rows = rows.map((r) => ({
            ...r,
            recurring_bill_splits: db.tables.recurring_bill_splits.filter(
              (s) => s.recurring_bill_id === r.id,
            ),
          }));
        }
        if (state.single) return Promise.resolve({ data: rows[0] ?? null, error: null });
        return Promise.resolve({ data: rows, error: null });
      }

      function runUpdate() {
        const rows = db.tables[table].filter((r) =>
          state.filters.every(([c, v]: [string, any]) => r[c] === v),
        );
        for (const r of rows) Object.assign(r, state.update);
        return Promise.resolve({ data: rows, error: null });
      }

      return api;
    },
  };
}

// Inline copy of the edge function logic so we can run it under vitest
// without spinning up Deno. Mirrors supabase/functions/process-recurring-bills/index.ts.
function computeNextRun(
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  from: Date,
): string {
  const next = new Date(from);
  next.setUTCHours(0, 0, 0, 0);
  if (frequency === "weekly" && dayOfWeek !== null) {
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (next.getUTCDay() !== dayOfWeek);
  } else if (frequency === "monthly" && dayOfMonth !== null) {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(Math.min(dayOfMonth, 28));
  }
  return next.toISOString().slice(0, 10);
}

async function runProcessRecurringBills(supabase: any) {
  const today = new Date().toISOString().slice(0, 10);
  let processed = 0;
  let skipped = 0;

  const { data: due } = await supabase
    .from("recurring_bills")
    .select("*, recurring_bill_splits(user_id, amount)")
    .eq("is_active", true)
    .lte("next_run_date", today);

  if (!due || due.length === 0) return { processed, skipped };

  for (const tpl of due) {
    const { error: runErr } = await supabase
      .from("recurring_bill_runs")
      .insert({ recurring_bill_id: tpl.id, run_date: tpl.next_run_date });

    if (runErr) {
      skipped++;
      const nextRun = computeNextRun(tpl.frequency, tpl.day_of_week, tpl.day_of_month, new Date(tpl.next_run_date));
      await supabase
        .from("recurring_bills")
        .update({ next_run_date: nextRun, last_run_date: tpl.next_run_date })
        .eq("id", tpl.id);
      continue;
    }

    const { data: expense } = await supabase
      .from("expenses")
      .insert({
        room_id: tpl.room_id,
        created_by: tpl.created_by,
        paid_by: tpl.paid_by,
        title: tpl.title,
        total_amount: tpl.total_amount,
        category: tpl.category,
        notes: tpl.notes,
        split_type: tpl.split_type,
        status: "pending",
      })
      .select()
      .single();

    const splits = (tpl.recurring_bill_splits || []).map((s: any) => ({
      expense_id: expense.id,
      user_id: s.user_id,
      amount: s.amount,
      status: "pending",
      is_paid: s.user_id === tpl.paid_by,
    }));
    if (splits.length > 0) await supabase.from("expense_splits").insert(splits);

    const notifyRows = splits
      .filter((s: any) => s.user_id !== tpl.paid_by)
      .map((s: any) => ({
        user_id: s.user_id,
        room_id: tpl.room_id,
        type: "expense",
        title: `🔁 Recurring: ${tpl.title}`,
        body: `Your share: ${s.amount}`,
        reference_type: "expense",
        reference_id: expense.id,
        is_read: false,
      }));
    if (notifyRows.length > 0) await supabase.from("notifications").insert(notifyRows);

    const nextRun = computeNextRun(tpl.frequency, tpl.day_of_week, tpl.day_of_month, new Date(tpl.next_run_date));
    await supabase
      .from("recurring_bills")
      .update({ next_run_date: nextRun, last_run_date: tpl.next_run_date })
      .eq("id", tpl.id);

    processed++;
  }

  return { processed, skipped };
}

describe("Recurring Bills E2E", () => {
  let db: ReturnType<typeof createInMemoryDb>;
  let supabase: any;
  const today = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    db = createInMemoryDb();
    supabase = makeMockClient(db);

    // Seed: a monthly recurring bill due today, with 3 equal splits.
    db.tables.recurring_bills.push({
      id: "rb-1",
      room_id: "room-1",
      created_by: "user-A",
      paid_by: "user-A",
      title: "Rent",
      total_amount: 300,
      category: "rent",
      notes: null,
      split_type: "equal",
      frequency: "monthly",
      day_of_week: null,
      day_of_month: 1,
      next_run_date: today,
      last_run_date: null,
      is_active: true,
    });
    db.tables.recurring_bill_splits.push(
      { recurring_bill_id: "rb-1", user_id: "user-A", amount: 100 },
      { recurring_bill_id: "rb-1", user_id: "user-B", amount: 100 },
      { recurring_bill_id: "rb-1", user_id: "user-C", amount: 100 },
    );
  });

  it("creates an expense, splits, notifications, and a run record on first invocation", async () => {
    const result = await runProcessRecurringBills(supabase);

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(db.tables.expenses).toHaveLength(1);
    expect(db.tables.expense_splits).toHaveLength(3);
    expect(db.tables.recurring_bill_runs).toHaveLength(1);

    // Notifications go to non-payers only (B and C; A is the payer)
    expect(db.tables.notifications).toHaveLength(2);
    const recipients = db.tables.notifications.map((n) => n.user_id).sort();
    expect(recipients).toEqual(["user-B", "user-C"]);

    // Splits sum equals total
    const sum = db.tables.expense_splits.reduce((a, s) => a + Number(s.amount), 0);
    expect(sum).toBe(300);

    // Payer's split is auto-marked paid
    const payerSplit = db.tables.expense_splits.find((s) => s.user_id === "user-A");
    expect(payerSplit?.is_paid).toBe(true);
  });

  it("does NOT create duplicate expenses on a second run for the same date (idempotency)", async () => {
    // First invocation creates the bill
    await runProcessRecurringBills(supabase);

    // Reset next_run_date back to today to simulate cron firing again
    // before the schedule has advanced (worst-case idempotency check).
    db.tables.recurring_bills[0].next_run_date = today;

    const second = await runProcessRecurringBills(supabase);

    // Skipped due to unique constraint on recurring_bill_runs
    expect(second.processed).toBe(0);
    expect(second.skipped).toBe(1);

    // No new expense / splits / notifications were created
    expect(db.tables.expenses).toHaveLength(1);
    expect(db.tables.expense_splits).toHaveLength(3);
    expect(db.tables.notifications).toHaveLength(2);
    expect(db.tables.recurring_bill_runs).toHaveLength(1);
  });

  it("advances next_run_date for monthly bills after a successful run", async () => {
    await runProcessRecurringBills(supabase);
    const tpl = db.tables.recurring_bills[0];
    expect(tpl.last_run_date).toBe(today);
    expect(tpl.next_run_date).not.toBe(today);
    // next_run_date should be strictly after today
    expect(new Date(tpl.next_run_date).getTime()).toBeGreaterThan(new Date(today).getTime());
  });
});
