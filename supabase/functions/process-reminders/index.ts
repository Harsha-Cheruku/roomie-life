import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    let processed = 0;

    // Fetch due reminders that haven't been notified yet
    const { data: dueReminders, error: fetchErr } = await supabase
      .from("reminders")
      .select("*")
      .eq("notified", false)
      .eq("status", "scheduled")
      .lte("remind_at", now.toISOString())
      .gte("remind_at", new Date(now.getTime() - 600000).toISOString()); // within last 10 min

    if (fetchErr) {
      console.error("Error fetching reminders:", fetchErr);
      throw fetchErr;
    }

    if (!dueReminders || dueReminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const reminder of dueReminders) {
      // Idempotent lock: update notified=true only if still false
      const { data: locked, error: lockErr } = await supabase
        .from("reminders")
        .update({ notified: true, status: "notified" })
        .eq("id", reminder.id)
        .eq("notified", false)
        .select("id")
        .maybeSingle();

      if (lockErr || !locked) continue; // Another worker got it

      // Check if related item is still actionable
      if (reminder.reminder_type === "expense" && reminder.related_id) {
        const { data: expense } = await supabase
          .from("expenses")
          .select("status")
          .eq("id", reminder.related_id)
          .maybeSingle();
        if (expense?.status === "settled") continue; // Skip settled expenses
      }

      if (reminder.reminder_type === "task" && reminder.related_id) {
        const { data: task } = await supabase
          .from("tasks")
          .select("status")
          .eq("id", reminder.related_id)
          .maybeSingle();
        if (task?.status === "done") continue; // Skip completed tasks
      }

      // Determine who to notify
      const targetUserId = reminder.user_id || reminder.created_by;
      const typeLabel = reminder.reminder_type === "expense" ? "💰" : reminder.reminder_type === "task" ? "📋" : "⏰";

      // Insert notification
      await supabase.from("notifications").insert({
        user_id: targetUserId,
        room_id: reminder.room_id,
        type: "reminder",
        title: `${typeLabel} Reminder: ${reminder.title}`,
        body: reminder.description || "Reminder is due now!",
        reference_type: reminder.reminder_type || "reminder",
        reference_id: reminder.related_id || reminder.id,
        is_read: false,
      });

      processed++;
    }

    return new Response(
      JSON.stringify({ success: true, processed, checkedAt: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in process-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
