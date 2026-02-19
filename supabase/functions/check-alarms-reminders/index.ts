import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const currentDay = now.getDay();
    const currentTimeStr = now.toTimeString().slice(0, 5); // "HH:MM"

    let alarmsTriggered = 0;
    let remindersTriggered = 0;

    // ── ALARMS ──────────────────────────────────────────────
    // Find active alarms that should ring now (within 1 minute window)
    const { data: alarms, error: alarmErr } = await supabase
      .from("alarms")
      .select("*")
      .eq("is_active", true)
      .contains("days_of_week", [currentDay]);

    if (alarmErr) {
      console.error("Error fetching alarms:", alarmErr);
    }

    if (alarms) {
      for (const alarm of alarms) {
        const alarmTime = alarm.alarm_time.slice(0, 5); // "HH:MM"
        if (alarmTime !== currentTimeStr) continue;

        // Check if already triggered in last 2 minutes
        const twoMinAgo = new Date(now.getTime() - 120000).toISOString();
        const { data: existing } = await supabase
          .from("alarm_triggers")
          .select("id")
          .eq("alarm_id", alarm.id)
          .gte("triggered_at", twoMinAgo)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Create trigger
        const { error: triggerErr } = await supabase
          .from("alarm_triggers")
          .insert({
            alarm_id: alarm.id,
            status: "ringing",
            ring_count: 0,
          });

        if (!triggerErr) {
          alarmsTriggered++;

          // Create notifications for all room members
          const { data: members } = await supabase
            .from("room_members")
            .select("user_id")
            .eq("room_id", alarm.room_id);

          if (members) {
            const notifications = members.map((m) => ({
              user_id: m.user_id,
              room_id: alarm.room_id,
              type: "alarm",
              title: `🔔 Alarm: ${alarm.title}`,
              body: `It's ${alarmTime}! Alarm is ringing.`,
              reference_type: "alarm",
              reference_id: alarm.id,
              is_read: false,
            }));

            await supabase.from("notifications").insert(notifications);
          }
        }
      }
    }

    // ── REMINDERS ───────────────────────────────────────────
    // Find scheduled reminders that are due (within 1 minute window)
    const oneMinAgo = new Date(now.getTime() - 60000).toISOString();
    const thirtySecAhead = new Date(now.getTime() + 30000).toISOString();

    const { data: reminders, error: reminderErr } = await supabase
      .from("reminders")
      .select("*")
      .eq("status", "scheduled")
      .gte("remind_at", oneMinAgo)
      .lte("remind_at", thirtySecAhead);

    if (reminderErr) {
      console.error("Error fetching reminders:", reminderErr);
    }

    if (reminders) {
      for (const reminder of reminders) {
        // Update status to 'notified'
        const { error: updateErr } = await supabase
          .from("reminders")
          .update({ status: "notified" })
          .eq("id", reminder.id)
          .eq("status", "scheduled");

        if (updateErr) continue;

        // Determine who should be notified
        const allowedCompleters = reminder.allowed_completers || [];

        // Get room members
        const { data: members } = await supabase
          .from("room_members")
          .select("user_id")
          .eq("room_id", reminder.room_id);

        if (members) {
          const notifyUsers = members.filter((m) => {
            if (m.user_id === reminder.created_by) return true;
            if (allowedCompleters.length === 0) return true;
            return allowedCompleters.includes(m.user_id);
          });

          const notifications = notifyUsers.map((m) => ({
            user_id: m.user_id,
            room_id: reminder.room_id,
            type: "reminder",
            title: `⏰ Reminder: ${reminder.title}`,
            body: reminder.description || "Reminder is due now!",
            reference_type: "reminder",
            reference_id: reminder.id,
            is_read: false,
          }));

          if (notifications.length > 0) {
            await supabase.from("notifications").insert(notifications);
          }
        }

        remindersTriggered++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alarmsTriggered,
        remindersTriggered,
        checkedAt: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-alarms-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
