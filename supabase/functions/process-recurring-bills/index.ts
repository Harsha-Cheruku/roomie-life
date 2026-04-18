import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function computeNextRun(frequency: string, dayOfWeek: number | null, dayOfMonth: number | null, from: Date): string {
  const next = new Date(from);
  next.setUTCHours(0, 0, 0, 0);
  if (frequency === "weekly" && dayOfWeek !== null) {
    // advance to next occurrence of dayOfWeek (strictly after `from`)
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (next.getUTCDay() !== dayOfWeek);
  } else if (frequency === "monthly" && dayOfMonth !== null) {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(Math.min(dayOfMonth, 28));
  }
  return next.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().slice(0, 10);
    let processed = 0;
    let skipped = 0;

    const { data: due, error } = await supabase
      .from("recurring_bills")
      .select("*, recurring_bill_splits(user_id, amount)")
      .eq("is_active", true)
      .lte("next_run_date", today);

    if (error) throw error;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const tpl of due) {
      // Idempotency lock — try to claim this run
      const { error: runErr } = await supabase
        .from("recurring_bill_runs")
        .insert({ recurring_bill_id: tpl.id, run_date: tpl.next_run_date });

      if (runErr) {
        // Duplicate (already processed) — just advance the date
        skipped++;
        const nextRun = computeNextRun(
          tpl.frequency,
          tpl.day_of_week,
          tpl.day_of_month,
          new Date(tpl.next_run_date)
        );
        await supabase
          .from("recurring_bills")
          .update({ next_run_date: nextRun, last_run_date: tpl.next_run_date })
          .eq("id", tpl.id);
        continue;
      }

      // Create the expense
      const { data: expense, error: expErr } = await supabase
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

      if (expErr || !expense) {
        console.error("Expense insert failed:", expErr);
        continue;
      }

      // Create splits
      const splits = (tpl.recurring_bill_splits || []).map((s: any) => ({
        expense_id: expense.id,
        user_id: s.user_id,
        amount: s.amount,
        status: "pending",
        is_paid: s.user_id === tpl.paid_by,
      }));

      if (splits.length > 0) {
        await supabase.from("expense_splits").insert(splits);
      }

      // Notify members (except payer)
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
      if (notifyRows.length > 0) {
        await supabase.from("notifications").insert(notifyRows);
      }

      // Link run to expense + advance schedule
      await supabase
        .from("recurring_bill_runs")
        .update({ expense_id: expense.id })
        .eq("recurring_bill_id", tpl.id)
        .eq("run_date", tpl.next_run_date);

      const nextRun = computeNextRun(
        tpl.frequency,
        tpl.day_of_week,
        tpl.day_of_month,
        new Date(tpl.next_run_date)
      );
      await supabase
        .from("recurring_bills")
        .update({ next_run_date: nextRun, last_run_date: tpl.next_run_date })
        .eq("id", tpl.id);

      processed++;
    }

    return new Response(
      JSON.stringify({ success: true, processed, skipped, checkedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-recurring-bills error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
