import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse } from "../_shared/errors.ts";

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
      // Idempotency lock — try to claim this run as "pending creator confirmation"
      const { data: runRow, error: runErr } = await supabase
        .from("recurring_bill_runs")
        .insert({ recurring_bill_id: tpl.id, run_date: tpl.next_run_date, status: "pending" })
        .select("id")
        .single();

      if (runErr) {
        // Duplicate (already created) — just advance the schedule and move on
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

      // Ask the bill creator to confirm — do NOT create the expense yet
      await supabase.from("notifications").insert({
        user_id: tpl.created_by,
        room_id: tpl.room_id,
        type: "recurring_bill",
        title: `🔁 Confirm recurring bill: ${tpl.title}`,
        body: `${tpl.total_amount} is scheduled for today. Tap to approve or skip.`,
        reference_type: "recurring_bill",
        reference_id: tpl.id,
        is_read: false,
      });

      // Advance schedule so the next cycle is queued
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
    return errorResponse("process-recurring-bills", e, corsHeaders);
  }
});
